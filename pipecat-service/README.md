# Pipecat Real-Time Voice Orchestration Service

Dedicated Python service powered by **Pipecat** for real-time, low-latency, full-duplex conversational voice orchestration over **Twilio Media Streams**.

---

## 🏗️ Architecture

```
Twilio Media Stream (mu-law 8kHz audio)
   │
   ▼
Pipecat WebSocket Server (ws://localhost:8765/ws/twilio)
   ├── STT: Deepgram Streaming STT / AssemblyAI
   ├── LLM: Groq (llama-3.1-8b-instant) with Ollama (llama3.2) fallback
   └── TTS: ElevenLabs (eleven_turbo_v2_5) with Amazon Polly fallback
   │
   ├── Fetch Runtime Config: GET http://localhost:3000/api/internal/runtime-config
   └── Sync Call Completion: POST http://localhost:3000/api/internal/call-complete
```

---

## 🚀 Quickstart

### 1. Install Dependencies
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment Variables
Ensure your root `.env` or local `.env` contains:
```env
PIPECAT_PORT=8765
NODE_API_URL=http://localhost:3000
INTERNAL_API_KEY=internal_secret_key_123

GROQ_API_KEY=gsk_...
ELEVENLABS_API_KEY=sk_...
DEEPGRAM_API_KEY=...
```

### 3. Run Service
```bash
python bot.py
```

### 4. Health Check
```bash
curl http://localhost:8765/health
```
