import { env } from '../../config/env.js';

const audioBufferStore = new Map();
const MAX_STORE_BYTES = 100 * 1024 * 1024; // 100MB RAM Limit
const TTL_MS = 30000; // 30s TTL

function getStoreSizeBytes() {
    let total = 0;
    for (const [, item] of audioBufferStore) {
        total += item.buffer.length;
    }
    return total;
}

export async function speakWithElevenLabs(text, publicTunnelUrl, voiceIdOverride) {
    if (!env.ELEVENLABS_API_KEY) return null;

    const voiceId = voiceIdOverride || env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
    const start = Date.now();

    try {
        const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            body: JSON.stringify({
                text,
                model_id: 'eleven_turbo_v2_5',
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            })
        });

        if (!resp.ok) {
            console.error('   [ElevenLabs Error]: status', resp.status);
            return null;
        }

        const audioBuffer = Buffer.from(await resp.arrayBuffer());

        // Enforce memory limits - drop oldest if exceeding 100MB
        while (getStoreSizeBytes() + audioBuffer.length > MAX_STORE_BYTES && audioBufferStore.size > 0) {
            const oldestKey = audioBufferStore.keys().next().value;
            audioBufferStore.delete(oldestKey);
        }

        const audioId = `speech_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
        audioBufferStore.set(audioId, { buffer: audioBuffer, createdAt: Date.now() });

        // Auto TTL cleanup after 30s
        setTimeout(() => audioBufferStore.delete(audioId), TTL_MS);

        const latency = Date.now() - start;
        console.log(`   [ElevenLabs TTS] Audio rendered (${audioBuffer.byteLength} bytes) in ${latency}ms`);
        return {
            audioUrl: `${publicTunnelUrl}/audio/${audioId}?ngrok-skip-browser-warning=true`,
            latency,
            charCount: text.length
        };
    } catch (err) {
        console.error('   [ElevenLabs Exception]:', err.message);
        return null;
    }
}

export function getAudioBuffer(audioId) {
    const item = audioBufferStore.get(audioId);
    return item ? item.buffer : null;
}
