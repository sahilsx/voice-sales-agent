import mongoose from 'mongoose';
import { env } from '../config/env.js';

export function getHealth(req, res) {
    res.json({
        status: 'ok',
        service: 'VoiceAI Enterprise Engine',
        timestamp: new Date().toISOString()
    });
}

export function getReadiness(req, res) {
    const isDbConnected = mongoose.connection.readyState === 1;
    const isLlmConfigured = Boolean(env.GROQ_API_KEY || env.OLLAMA_URL);
    const isTtsConfigured = Boolean(env.ELEVENLABS_API_KEY);

    const isReady = isDbConnected && isLlmConfigured;

    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
        status: isReady ? 'ready' : 'not_ready',
        database: isDbConnected ? 'connected' : 'disconnected',
        llm: isLlmConfigured ? 'available' : 'unavailable',
        tts: isTtsConfigured ? 'available' : 'disabled',
        timestamp: new Date().toISOString()
    });
}
