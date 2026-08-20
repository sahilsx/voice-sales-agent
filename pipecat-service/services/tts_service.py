import json
import logging
import urllib.request
import asyncio
from typing import Optional
from config import config

logger = logging.getLogger(__name__)

def _sync_synthesize_elevenlabs(text: str, voice_id: Optional[str] = None) -> bytes:
    if not config.ELEVENLABS_API_KEY:
        logger.warning("⚠️ ELEVENLABS_API_KEY missing, using fallback silence.")
        return b'\xff' * 16000

    target_voice = voice_id or config.ELEVENLABS_VOICE_ID or "JBFqnCBsd6RMkjVDRZzb"
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{target_voice}?output_format=ulaw_8000"

    headers = {
        "xi-api-key": config.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/basic"
    }

    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
    }

    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            if resp.status == 200:
                content = resp.read()
                logger.info(f"   [ElevenLabs TTS] Synthesized {len(text)} chars ({len(content)} bytes ulaw_8000)")
                return content
    except Exception as e:
        logger.error(f"❌ ElevenLabs TTS API error: {e}")

    # Fallback to keep audio stream active
    return b'\xff' * 16000

async def synthesize_elevenlabs(text: str, voice_id: Optional[str] = None) -> bytes:
    return await asyncio.to_thread(_sync_synthesize_elevenlabs, text, voice_id)

