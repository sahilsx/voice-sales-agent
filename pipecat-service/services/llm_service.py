import json
import logging
import urllib.request
import asyncio
from config import config

logger = logging.getLogger(__name__)

def _sync_query_groq(messages: list) -> str:
    if not config.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not configured")

    headers = {
        "Authorization": f"Bearer {config.GROQ_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Pipecat-Client/1.0"
    }

    models_to_try = ["groq/compound-mini", "groq/compound", "openai/gpt-oss-120b"]
    for model in models_to_try:
        try:
            payload = {
                "model": model,
                "messages": messages,
                "max_tokens": 60,
                "temperature": 0.7
            }
            req = urllib.request.Request("https://api.groq.com/openai/v1/chat/completions", data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    reply = data["choices"][0]["message"]["content"].strip()
                    if reply:
                        return reply
        except Exception as e:
            logger.warning(f"   [Groq Model {model} Notice]: {e}")

    raise RuntimeError("All Groq API models failed")

async def query_groq(messages: list) -> str:
    return await asyncio.to_thread(_sync_query_groq, messages)

def _sync_query_ollama(messages: list) -> str:
    headers = {"Content-Type": "application/json"}
    payload = {
        "model": "llama3.2",
        "messages": messages,
        "options": {"num_predict": 50, "temperature": 0.7},
        "stream": False
    }

    req = urllib.request.Request(config.OLLAMA_URL, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=8.0) as resp:
        if resp.status == 200:
            data = json.loads(resp.read().decode("utf-8"))
            return data["message"]["content"].strip()
        raise RuntimeError(f"Ollama status {resp.status}")

async def query_ollama(messages: list) -> str:
    return await asyncio.to_thread(_sync_query_ollama, messages)

async def generate_llm_response(messages: list) -> str:
    """Queries Groq with fallback to Ollama if Groq fails or times out."""
    if config.GROQ_API_KEY:
        try:
            reply = await query_groq(messages)
            if reply:
                logger.info(f"   [Groq LLM] -> {reply}")
                return reply
        except Exception as e:
            logger.warning(f"   [Groq LLM Warning]: {e} -> Falling back to Ollama...")

    try:
        reply = await query_ollama(messages)
        if reply:
            logger.info(f"   [Ollama LLM Fallback] -> {reply}")
            return reply
    except Exception as e:
        logger.error(f"   [Ollama LLM Error]: {e} -> Returning safe fallback.")

    return "Sounds good. Is there anything specific you'd like to check out on our mobile menu site?"

