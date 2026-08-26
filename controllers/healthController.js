import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { checkQwenHealth } from '../services/ai/providers/qwenProvider.js';

export function getHealth(req, res) {
    res.json({
        status: 'ok',
        service: 'VoiceAI Enterprise Engine',
        llm_provider: env.LLM_PROVIDER || 'groq',
        timestamp: new Date().toISOString()
    });
}

export async function getReadiness(req, res) {
    const isDbConnected = mongoose.connection.readyState === 1;
    const isLlmConfigured = Boolean(env.GROQ_API_KEY || env.OLLAMA_URL || env.QWEN_BASE_URL);
    const isTtsConfigured = Boolean(env.ELEVENLABS_API_KEY);

    const isReady = isDbConnected && isLlmConfigured;

    let qwenStatus = null;
    if (env.LLM_PROVIDER === 'qwen' || env.QWEN_ENABLED) {
        qwenStatus = await checkQwenHealth();
    }

    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
        status: isReady ? 'ready' : 'not_ready',
        database: isDbConnected ? 'connected' : 'disconnected',
        llm: isLlmConfigured ? 'available' : 'unavailable',
        llm_provider: env.LLM_PROVIDER || 'groq',
        qwen: qwenStatus,
        tts: isTtsConfigured ? 'available' : 'disabled',
        timestamp: new Date().toISOString()
    });
}
