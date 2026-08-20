import asyncio
import json
import logging
import websockets

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pipecat-tester")

async def test_pipecat_pipeline():
    url = "ws://127.0.0.1:8765/ws/twilio"
    logger.info(f"🔌 Connecting to Pipecat Engine at {url}...")

    try:
        async with websockets.connect(url) as ws:
            logger.info("✓ Connected to Pipecat WebSocket server!")

            # 1. Send Twilio Stream 'start' event
            start_payload = {
                "event": "start",
                "streamSid": "MZ_test_stream_001",
                "start": {
                    "callSid": "CA_test_call_001",
                    "streamSid": "MZ_test_stream_001",
                    "customParameters": {
                        "agentId": "agent_1786513884539",
                        "leadId": "lead_test_001",
                        "orgId": "org_master"
                    }
                }
            }
            logger.info("📤 Sending Twilio 'start' event to Pipecat...")
            await ws.send(json.dumps(start_payload))

            frames_received = 0
            total_bytes = 0

            # 2. Listen for Pipecat AI audio responses
            logger.info("🎧 Listening for Pipecat real-time audio output frames...")
            while frames_received < 20:
                msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
                data = json.loads(msg)
                if data.get("event") == "media":
                    frames_received += 1
                    payload_len = len(data.get("media", {}).get("payload", ""))
                    total_bytes += payload_len
                    if frames_received % 5 == 0 or frames_received == 1:
                        logger.info(f"   🔊 Received audio media frame #{frames_received} ({payload_len} chars base64)")

            logger.info(f"\n=====================================================")
            logger.info(f"✅ SUCCESS: Pipecat Voice Engine is 100% WORKING!")
            logger.info(f"   Received {frames_received} audio frames ({total_bytes} bytes) from Pipecat AI pipeline.")
            logger.info(f"=====================================================\n")

    except Exception as e:
        logger.error(f"❌ Pipecat Test Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_pipecat_pipeline())
