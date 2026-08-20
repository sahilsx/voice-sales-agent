import sys
import os

# Auto-resolve virtualenv packages if executed or analyzed via system interpreter
_dir = os.path.dirname(os.path.abspath(__file__))
_venv_lib = os.path.join(_dir, "venv", "lib")
if os.path.exists(_venv_lib):
    for _sub in os.listdir(_venv_lib):
        _sp = os.path.join(_venv_lib, _sub, "site-packages")
        if os.path.exists(_sp) and _sp not in sys.path:
            sys.path.insert(0, _sp)

import json
import logging
import urllib.parse
import asyncio
import websockets
from config import config
from pipeline.runner import TwilioPipecatSession

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("pipecat-service")

async def process_request(*args, **kwargs):
    conn_or_path = args[0] if len(args) > 0 else None
    req_or_headers = args[1] if len(args) > 1 else None
    path = getattr(req_or_headers, 'path', None) or (conn_or_path if isinstance(conn_or_path, str) else None)

    if path == "/health":
        payload_data = {
            "status": "ok",
            "service": "Pipecat Real-Time Voice Orchestration Engine",
            "node_api_url": config.NODE_API_URL,
            "deepgram_configured": bool(config.DEEPGRAM_API_KEY),
            "groq_configured": bool(config.GROQ_API_KEY),
            "elevenlabs_configured": bool(config.ELEVENLABS_API_KEY),
            "use_pipecat": True
        }
        if hasattr(conn_or_path, 'respond'):
            return conn_or_path.respond(200, json.dumps(payload_data))
        else:
            headers = [("Content-Type", "application/json"), ("Access-Control-Allow-Origin", "*")]
            return (200, headers, json.dumps(payload_data).encode("utf-8"))
    return None  # Continue with WebSocket handshake

async def ws_handler(websocket, *args, **kwargs):
    raw_path = getattr(websocket, 'path', '') or (getattr(websocket.request, 'path', '') if hasattr(websocket, 'request') else '') or (args[0] if args and isinstance(args[0], str) else '')
    logger.info(f"📍 [STEP 4] Python Engine received WebSocket connection on path: {raw_path}")
    parsed = urllib.parse.urlparse(raw_path)
    params = dict(urllib.parse.parse_qsl(parsed.query))

    session = None
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                event = data.get("event")

                if event == "start":
                    start_data = data.get("start", {})
                    custom_params = start_data.get("customParameters", {})
                    merged_params = {**params, **custom_params}
                    stream_sid = data.get("streamSid") or start_data.get("streamSid")
                    merged_params["callSid"] = start_data.get("callSid") or merged_params.get("callSid") or params.get("callSid")

                    logger.info(f"✓ [STEP 4] Twilio 'start' event received. StreamSid: {stream_sid} | CallSid: {merged_params.get('callSid')}")
                    session = TwilioPipecatSession(websocket, merged_params)
                    session.stream_sid = stream_sid
                    await session.initialize()

                elif event == "media":
                    if session and session.is_running:
                        payload = data.get("media", {}).get("payload")
                        if payload:
                            await session.process_incoming_audio(payload)

                elif event == "speech" or event == "transcript":
                    speech_text = data.get("text") or data.get("transcript")
                    if session and speech_text:
                        await session.handle_user_speech(speech_text)

                elif event == "stop":
                    logger.info("⏹️ Twilio Stream stop event received.")
                    if session:
                        await session.close()
                    break

            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosed:
        logger.info("🔌 WebSocket connection closed by client.")
    finally:
        if session and session.is_running:
            await session.close()

async def main():
    logger.info("=====================================================")
    logger.info(f"  Starting Pipecat Voice Orchestration Service ({config.PORT})")
    logger.info("=====================================================")

    async with websockets.serve(ws_handler, "0.0.0.0", config.PORT, process_request=process_request):
        logger.info(f"✓ Pipecat Real-Time WebSocket Server listening on ws://0.0.0.0:{config.PORT}/ws/twilio")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Pipecat server stopped.")
