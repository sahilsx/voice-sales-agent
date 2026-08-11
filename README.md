# 🎙️ VoiceAI Enterprise - Production AI Voice Sales Agent Platform

An enterprise-grade, full-stack **Human-Like AI Voice Sales Agent Platform** that automates outbound telephony sales calls using **Twilio PSTN**, **Groq GPU LLMs**, **ElevenLabs Text-to-Speech**, and **MongoDB Atlas Cloud Database**.

![VoiceAI Dashboard](https://img.shields.io/badge/UI-Glassmorphic_Dashboard-6366f1)
![Database](https://img.shields.io/badge/Database-MongoDB_Atlas-10b981)
![Telephony](https://img.shields.io/badge/Telephony-Twilio_Voice-f59e0b)
![Voice Synthesis](https://img.shields.io/badge/TTS-ElevenLabs-ec4899)
![AI Engine](https://img.shields.io/badge/LLM-Groq_Llama3_/_Ollama-8b5cf6)

---

## 🌟 Key Features

1. **Human-Sounding Unscripted Voice AI**:
   - Natural conversational flow with **short 1-sentence turns**.
   - Built-in natural human speech fillers (`hmm`, `well`, `you know`, `got it`) to eliminate robotic delays.
   - Dynamic prompt generation using customer context and lead interest.

2. **Automated AI Lead Qualification & Sentiment Classification**:
   - Real-time post-call and mid-call conversation analysis using LLMs.
   - Automatically qualifies leads into three distinct categories:
     - 🟢 **Interested**: Customer requested demo, agreed to walkthrough, or asked for pricing.
     - 🔴 **Not Interested**: Customer declined or requested removal from call list.
     - 🟡 **Follow Up Needed**: Customer requested call back at another time or was busy.

3. **Enterprise Glassmorphic Dashboard**:
   - **AI Agents Manager**: Create, edit, and configure custom AI sales personas, goals, greetings, and ElevenLabs voice IDs.
   - **Leads & Excel Upload**: Import customer lists in bulk via `.xlsx`, `.xls`, or `.csv` sheets with automatic header parsing (`Name`, `Phone`, `Interest`).
   - **Manual Lead Entry**: Add single leads with strict E.164 phone number validation (`+91...`, `+1...`).
   - **AI Batch Campaigns**: Launch single-click automated call sequences for all pending leads.
   - **Call Transcripts & Logs**: Turn-by-turn chat transcript viewer with AI Qualification badges and duration metrics.

4. **Production Reliability & UX**:
   - **Zero Disk Audio I/O**: ElevenLabs MP3 speech audio streams directly from RAM (`Map` buffer with 30s auto-eviction), writing 0 temporary audio files to disk.
   - **Toastify UI Notifications**: Instant glassmorphic toast notifications replace native browser alert popups.
   - **Refresh State Preservation**: Preserves active tab across browser refreshes via `localStorage` and URL hash.
   - **Full Data Governance**: Single & bulk deletion endpoints for Agents, Leads, and Transcripts.

---

## 🛠️ Architecture & Tech Stack

```
 ┌────────────────┐       ┌────────────────────┐       ┌──────────────────────┐
 │ Customer Phone │ ◄───► │  Twilio Voice API  │ ◄───► │ VoiceAI Express Server│
 └────────────────┘       └────────────────────┘       └──────────┬───────────┘
                                                                  │
                ┌─────────────────────────────────────────────────┼─────────────────────────────────────────────────┐
                │                                                 │                                                 │
                ▼                                                 ▼                                                 ▼
      ┌──────────────────┐                              ┌──────────────────┐                              ┌──────────────────┐
      │  Groq / Ollama   │                              │    ElevenLabs    │                              │  MongoDB Atlas   │
      │ (Fast LLM Logic) │                              │(Human Speech TTS)│                              │ (Cloud Database) │
      └──────────────────┘                              └──────────────────┘                              └──────────────────┘
```

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend Framework** | Node.js (ES Modules) + Express.js | Core web server & TwiML webhook handlers |
| **Cloud Database** | MongoDB Atlas + Mongoose | Cloud storage for Agents, Leads, and Call Logs |
| **Telephony Provider** | Twilio PSTN Voice API | Handles live phone calls & TwiML Gather speech recognition |
| **Conversational AI** | Groq API (`llama-3.3-70b-versatile`) / Ollama | Fast, human-like sales dialogue generation & sentiment classification |
| **Voice Synthesis** | ElevenLabs API (`eleven_multilingual_v2`) | Ultra-realistic, warm human speech synthesis |
| **File Parsing** | Multer + XLSX | Bulk ingestion of `.xlsx`, `.xls`, and `.csv` lead sheets |
| **Frontend UI** | HTML5, Vanilla CSS3, Toastify.js | Responsive dark glassmorphic dashboard |

---

## 📁 Project Structure

```
voice-sales-agent/
├── db.js                     # MongoDB Atlas Mongoose connection & DB methods
├── index.js                  # Express server, Twilio webhook endpoints & RAM streaming
├── models/
│   ├── Agent.js              # Mongoose Schema for AI Sales Agents
│   ├── Lead.js               # Mongoose Schema for Customer Leads & AI Qualification
│   └── CallLog.js            # Mongoose Schema for Call Transcripts & Sentiments
├── routes/
│   └── api.js                # RESTful API router (Agents, Leads, Uploads, Logs, Deletions)
├── public/
│   └── index.html            # Glassmorphic Single-Page Application Dashboard
├── sample_leads.csv          # Sample CSV test file for lead imports
├── sample_leads.xlsx         # Sample Excel test file for lead imports
├── package.json              # Project metadata & npm dependencies (nodemon, mongoose, twilio)
└── .env                      # Environment configuration variables
```

---

## 🔑 Environment Variables (`.env`)

Create a `.env` file in the root directory:

```env
PORT=3000




---

## 🚀 Quick Start Guide

### 1. Installation

```bash
git clone https://github.com/sahilsx/voice-sales-agent.git
cd voice-sales-agent
npm install
```

### 2. Run Locally with Hot Reloading (`nodemon`)

```bash
npm start
```
*The server will start on `http://localhost:3000` with `nodemon` auto-reloading on code modifications.*

### 3. Expose Server to Twilio (Ngrok Webhook Tunnel)

In a separate terminal window:

```bash
ngrok http 3000
```
*Copy the generated public URL (e.g., `https://abc-123.ngrok-free.app`) to your Twilio phone number configuration.*

---

## 📡 REST API Reference

### Agents Endpoints
- **`GET /api/agents`**: List all AI Sales Agents.
- **`POST /api/agents`**: Create or edit an AI Sales Agent.
- **`DELETE /api/agents/:id`**: Delete a specific AI Sales Agent.

### Leads Endpoints
- **`GET /api/leads?agent_id=<id>`**: Fetch leads (optional filter by agent).
- **`POST /api/leads/upload`**: Upload an Excel (`.xlsx`) or CSV (`.csv`) file of leads.
- **`POST /api/leads/manual`**: Add a single customer lead manually.
- **`DELETE /api/leads/:id`**: Delete a specific lead.
- **`DELETE /api/leads?agent_id=<id>`**: Bulk clear all leads (or filtered agent leads).

### Call Campaigns & Logs
- **`POST /api/campaigns/start`**: Launch automated batch calling for all pending leads.
- **`POST /api/campaigns/trigger-lead`**: Place an immediate live call to a single lead.
- **`GET /api/logs`**: Fetch all call transcripts and duration metrics.
- **`DELETE /api/logs/:callSid`**: Delete a specific call transcript log.
- **`DELETE /api/logs`**: Bulk clear all call logs.

---

## 🖥️ Webhooks Engine (`index.js`)

- **`POST /voice`**: Initiated by Twilio when an outbound call connects. Greets the customer with the agent's personalized first message (`{{lead_name}}`).
- **`POST /respond`**: Triggered when customer speaks. Transcribes input via Twilio Gather, queries Groq/Ollama LLM for short natural human response, synthesizes audio via ElevenLabs, runs AI Lead Qualification, and returns TwiML.
- **`POST /status`**: Registered `statusCallback` endpoint. Fired on call completion to finalize lead status (`completed` / `failed`) and save final AI interest qualification (`Interested`, `Not Interested`, `Follow Up Needed`) to MongoDB Atlas.
- **`GET /audio/:audioId`**: Serves in-memory ElevenLabs MP3 audio buffers to Twilio with auto RAM cleanup.

---

## 📄 License

MIT License. Developed for enterprise voice AI automation.
