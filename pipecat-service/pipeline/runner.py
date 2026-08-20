import time
import json
import logging
import asyncio
import base64
from typing import Optional
from config import config
from services.node_client import fetch_runtime_config, notify_call_complete
from services.llm_service import generate_llm_response
from services.tts_service import synthesize_elevenlabs

logger = logging.getLogger(__name__)

class TwilioPipecatSession:
    def __init__(self, websocket, call_params: dict):
        self.websocket = websocket
        self.call_sid = call_params.get("callSid")
        self.agent_id = call_params.get("agentId")
        self.lead_id = call_params.get("leadId")
        self.org_id = call_params.get("orgId", "org_master")
        self.stream_sid = None

        self.start_time = time.time()
        self.runtime_config = {}
        self.history = []
        self.is_running = True
        self.is_speaking = False
        self.is_interrupted = False
        self.deepgram_ws = None

    async def initialize(self):
        logger.info(f"📍 [STEP 4] Initializing Pipecat Session for CallSid {self.call_sid}")

        self.runtime_config = await fetch_runtime_config(
            self.call_sid, self.agent_id, self.lead_id, self.org_id
        )
        system_prompt = self.runtime_config.get("systemPrompt", "You are a sales representative.")
        logger.info(f"✓ [STEP 4] Fetched runtime config from Node.js (Prompt len: {len(system_prompt)})")
        self.history = [{"role": "system", "content": system_prompt}]

        prior_turns = self.runtime_config.get("priorTurns", [])
        if prior_turns:
            self.history.extend(prior_turns)

        initial_greeting = self.runtime_config.get("initialGreeting", "Hello! How can I help you today?")
        self.history.append({"role": "assistant", "content": initial_greeting})

        # Start continuous audio keepalive task to keep Twilio Media Stream active
        asyncio.create_task(self.start_audio_keepalive())

        # Connect Deepgram STT Streaming WebSocket
        if config.DEEPGRAM_API_KEY:
            try:
                import websockets
                url = "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1&punctuate=true&interim_results=true&endpointing=300&utterance_end_ms=1000"
                headers = {"Authorization": f"Token {config.DEEPGRAM_API_KEY}"}
                self.deepgram_ws = await websockets.connect(url, additional_headers=headers)
                logger.info("✓ [STEP 4] Connected to Deepgram Real-Time STT Engine.")
                asyncio.create_task(self.listen_stt())
            except Exception as e:
                logger.error(f"❌ Deepgram STT connection failed: {e}")

        # Synthesize initial greeting audio
        try:
            logger.info(f"📍 [STEP 5] Synthesizing initial greeting audio with ElevenLabs: \"{initial_greeting}\"")
            audio_bytes = await synthesize_elevenlabs(
                initial_greeting, self.runtime_config.get("agent", {}).get("voice_id")
            )
            logger.info(f"✓ [STEP 5] ElevenLabs synthesized {len(audio_bytes)} bytes of 8kHz mu-law audio. Streaming to Twilio...")
            await self.send_audio_to_twilio(audio_bytes)
            logger.info(f"✓ [STEP 5] Completed initial greeting audio stream to Twilio.")
        except Exception as e:
            logger.error(f"❌ Initial greeting TTS failed: {e}")

    async def start_audio_keepalive(self):
        silence_frame = base64.b64encode(b'\xff' * 160).decode("utf-8")
        while self.is_running:
            await asyncio.sleep(0.02)
            if self.websocket and self.stream_sid and not self.is_speaking and self.is_running:
                msg = {
                    "event": "media",
                    "streamSid": self.stream_sid,
                    "media": {
                        "payload": silence_frame
                    }
                }
                try:
                    await self.websocket.send(json.dumps(msg))
                except Exception:
                    break

    async def process_incoming_audio(self, base64_payload: str):
        if not self.deepgram_ws or not self.is_running:
            return
        try:
            pcm_bytes = base64.b64decode(base64_payload)
            await self.deepgram_ws.send(pcm_bytes)
        except Exception as e:
            logger.error(f"❌ Error sending audio frame to Deepgram: {e}")

    async def listen_stt(self):
        if not self.deepgram_ws:
            return
        try:
            async for msg in self.deepgram_ws:
                if not self.is_running:
                    break
                try:
                    data = json.loads(msg)
                    if data.get("is_final"):
                        alts = data.get("channel", {}).get("alternatives", [])
                        if alts and alts[0].get("transcript"):
                            transcript = alts[0]["transcript"].strip()
                            if transcript:
                                logger.info(f"🎙️ [Deepgram STT Speech]: \"{transcript}\"")
                                await self.handle_user_speech(transcript)
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Notice from Deepgram STT stream: {e}")

    async def send_audio_to_twilio(self, audio_bytes: bytes):
        if not self.stream_sid or not self.websocket or not audio_bytes:
            return

        self.is_speaking = True
        try:
            # Twilio mulaw 8000Hz 8-bit frame pacing: 160 bytes = 20ms audio chunk
            CHUNK_SIZE = 160
            for i in range(0, len(audio_bytes), CHUNK_SIZE):
                if not self.is_running or self.is_interrupted:
                    logger.info("🛑 Audio playback interrupted by customer speech.")
                    break

                chunk = audio_bytes[i:i + CHUNK_SIZE]
                payload_b64 = base64.b64encode(chunk).decode("utf-8")
                message = {
                    "event": "media",
                    "streamSid": self.stream_sid,
                    "media": {
                        "payload": payload_b64
                    }
                }
                await self.websocket.send(json.dumps(message))
                await asyncio.sleep(0.02)  # 20ms frame pacing
        except Exception as e:
            logger.error(f"❌ Error sending media frame to Twilio: {e}")
        finally:
            self.is_speaking = False

    async def handle_user_speech(self, user_speech: str):
        if not user_speech or not user_speech.strip():
            return

        logger.info(f"🗣️ [Customer Spoke]: {user_speech}")
        self.history.append({"role": "user", "content": user_speech})

        # Interrupt current audio playback if AI was speaking
        self.is_interrupted = True

        ai_reply = await generate_llm_response(self.history)
        should_end = "[end_call]" in ai_reply.lower() or "goodbye" in ai_reply.lower()
        cleaned_reply = ai_reply.replace("[END_CALL]", "").replace("[end_call]", "").strip()

        self.history.append({"role": "assistant", "content": cleaned_reply})

        self.is_interrupted = False
        try:
            audio_bytes = await synthesize_elevenlabs(
                cleaned_reply, self.runtime_config.get("agent", {}).get("voice_id")
            )
            logger.info(f"🔊 Synthesized audio response ({len(audio_bytes)} bytes)")
            await self.send_audio_to_twilio(audio_bytes)
        except Exception as e:
            logger.error(f"❌ ElevenLabs synthesis failed: {e}")

        if should_end:
            logger.info(f"🏁 Agent end signal detected. Closing Pipecat call {self.call_sid}.")
            await self.close()

    async def close(self):
        self.is_running = False
        if self.deepgram_ws:
            try:
                await self.deepgram_ws.close()
            except Exception:
                pass
        duration_seconds = int(time.time() - self.start_time)
        logger.info(f"🏁 Closing Pipecat session for CallSid {self.call_sid} ({duration_seconds}s)")
        await notify_call_complete(
            call_sid=self.call_sid,
            organization_id=self.org_id,
            agent_id=self.agent_id or self.runtime_config.get("agent", {}).get("id"),
            lead_id=self.lead_id or self.runtime_config.get("lead", {}).get("id"),
            transcript=self.history[1:], # Omit system prompt
            duration_seconds=duration_seconds,
            latency={"total": 250},
            cost={"total": 0.05},
            call_status="completed"
        )
