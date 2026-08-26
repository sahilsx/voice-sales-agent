import { env } from '../../../config/env.js';

/**
 * Dedicated Qwen GPU LLM Provider (vLLM OpenAI-Compatible Endpoint)
 * Runs locally on http://127.0.0.1:8000/v1
 */

export async function queryQwenRaw(messages) {
    const baseUrl = env.QWEN_BASE_URL || 'http://127.0.0.1:8000/v1';
    const model = env.QWEN_MODEL || 'Qwen/Qwen3-4B-Instruct-2507-FP8';
    const timeoutMs = env.QWEN_TIMEOUT_MS || 2000;

    const start = Date.now();
    const systemPrompt = messages[0];
    const recentHistory = messages.slice(1).slice(-4);
    const pruned = [systemPrompt, ...recentHistory];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: pruned,
                temperature: 0.65,
                top_p: 0.8,
                max_tokens: 100,
                stream: false
            }),
            signal: controller.signal
        });

        clearTimeout(timer);

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.warn(`   [Qwen AI] provider=qwen latencyMs=${Date.now() - start} success=false error="HTTP ${response.status} ${errBody.substring(0, 80)}"`);
            throw new Error(`Qwen HTTP error ${response.status}`);
        }

        const data = await response.json();
        const rawReply = data.choices?.[0]?.message?.content?.trim() || '';

        if (!rawReply) {
            console.warn(`   [Qwen AI] provider=qwen latencyMs=${Date.now() - start} success=false error="empty response"`);
            throw new Error('Empty response from Qwen LLM');
        }

        console.log(`   [Qwen AI] provider=qwen latencyMs=${Date.now() - start} success=true -> "${rawReply}"`);
        return rawReply;
    } catch (err) {
        clearTimeout(timer);
        const latency = Date.now() - start;
        const errType = err.name === 'AbortError' ? `timeout (${timeoutMs}ms)` : err.message;
        console.warn(`   [Qwen AI] provider=qwen latencyMs=${latency} success=false error="${errType}"`);
        throw err;
    }
}

/**
 * Health check for Qwen vLLM service
 * Performs GET request to /v1/models
 */
export async function checkQwenHealth() {
    const baseUrl = env.QWEN_BASE_URL || 'http://127.0.0.1:8000/v1';
    const expectedModel = env.QWEN_MODEL || 'Qwen/Qwen3-4B-Instruct-2507-FP8';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);

    try {
        const response = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timer);

        if (!response.ok) {
            return { available: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const modelsList = data.data || data.models || [];
        const found = modelsList.some(m => m.id === expectedModel || (m.id && m.id.includes('Qwen')));

        return {
            available: true,
            model: expectedModel,
            modelFound: found
        };
    } catch (err) {
        clearTimeout(timer);
        return { available: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
    }
}
