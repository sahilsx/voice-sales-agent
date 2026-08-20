import json
import logging
import urllib.request
import urllib.parse
import asyncio
from typing import Optional
from config import config

logger = logging.getLogger(__name__)

def get_headers():
    return {
        "x-internal-api-key": config.INTERNAL_API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "Pipecat-Client/1.0"
    }

def _sync_fetch_runtime_config(url: str) -> Optional[dict]:
    req = urllib.request.Request(url, headers=get_headers(), method="GET")
    with urllib.request.urlopen(req, timeout=10.0) as resp:
        if resp.status == 200:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                return data.get("data")
    return None

async def fetch_runtime_config(
    call_sid: str,
    agent_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    org_id: Optional[str] = None
) -> dict:
    params = urllib.parse.urlencode({
        "call_sid": call_sid,
        "agent_id": agent_id or "",
        "lead_id": lead_id or "",
        "org_id": org_id or "org_master"
    })
    url = f"{config.NODE_API_URL}/api/internal/runtime-config?{params}"

    try:
        data = await asyncio.to_thread(_sync_fetch_runtime_config, url)
        if data:
            logger.info(f"✓ Fetched runtime config for CallSid {call_sid}")
            return data
    except Exception as e:
        logger.error(f"❌ Exception fetching runtime config from Node.js: {e}")

    # Safe fallback config if Node.js call fails
    return {
        "callSid": call_sid,
        "organizationId": org_id or "org_master",
        "agent": {"name": "Alex", "company": "Horizon Realty", "voice_id": config.ELEVENLABS_VOICE_ID},
        "lead": {"lead_name": "Customer"},
        "systemPrompt": "You are a professional AI sales representative.",
        "initialGreeting": "Hello! Thanks for answering. How are you today?",
        "priorTurns": [],
        "providers": {}
    }

def _sync_notify_call_complete(url: str, payload_bytes: bytes) -> bool:
    req = urllib.request.Request(url, data=payload_bytes, headers=get_headers(), method="POST")
    with urllib.request.urlopen(req, timeout=10.0) as resp:
        return resp.status == 200

async def notify_call_complete(
    call_sid: str,
    organization_id: str = "org_master",
    agent_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    transcript: Optional[list] = None,
    duration_seconds: int = 0,
    latency: Optional[dict] = None,
    cost: Optional[dict] = None,
    call_status: str = "completed"
) -> bool:
    url = f"{config.NODE_API_URL}/api/internal/call-complete"
    payload = {
        "callSid": call_sid,
        "organizationId": organization_id,
        "agentId": agent_id,
        "leadId": lead_id,
        "transcript": transcript or [],
        "duration_seconds": duration_seconds,
        "latency": latency or {},
        "cost": cost or {},
        "callStatus": call_status
    }
    payload_bytes = json.dumps(payload).encode("utf-8")

    try:
        success = await asyncio.to_thread(_sync_notify_call_complete, url, payload_bytes)
        if success:
            logger.info(f"✓ Synced call completion for CallSid {call_sid} to Node.js")
            return True
    except Exception as e:
        logger.error(f"❌ Exception syncing call completion: {e}")
    return False

