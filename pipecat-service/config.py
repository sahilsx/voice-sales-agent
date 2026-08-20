import os

def load_env_file():
    possible_paths = [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env")
    ]
    for filepath in possible_paths:
        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        key, value = line.split("=", 1)
                        key = key.strip()
                        value = value.strip().strip("'").strip('"')
                        if key and key not in os.environ:
                            os.environ[key] = value
                break
            except Exception:
                pass

load_env_file()
class Config:
    PORT = int(os.getenv("PIPECAT_PORT", "8765"))
    NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:3000")
    INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "internal_secret_key_123")

    DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
    ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
    ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")

config = Config()

