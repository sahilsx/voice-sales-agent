import { env } from '../../config/env.js';

const OLLAMA_TIMEOUT_MS = 8000;
const GROQ_TIMEOUT_MS = 4000;
const FALLBACK_RESPONSE = "Sounds good. Is there anything specific you'd like to check out on our mobile menu site?";

function withTimeout(promise, ms, label = 'operation') {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function queryGroqRaw(messages) {
    if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing');
    const start = Date.now();
    const systemPrompt = messages[0];
    const recentHistory = messages.slice(1).slice(-4);
    const pruned = [systemPrompt, ...recentHistory];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: pruned,
            max_tokens: 45,
            temperature: 0.5
        })
    });

    if (!response.ok) throw new Error(`Groq API status ${response.status}`);
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    console.log(`   [Groq AI] Latency: ${Date.now() - start}ms -> "${reply}"`);
    return reply;
}

async function queryOllamaRaw(messages) {
    const start = Date.now();
    const systemPrompt = messages[0];
    const recentHistory = messages.slice(1).slice(-4);
    const pruned = [systemPrompt, ...recentHistory];

    const response = await fetch(env.OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3.2',
            messages: pruned,
            options: { num_predict: 35, temperature: 0.5 },
            stream: false
        })
    });

    if (!response.ok) throw new Error(`Ollama status ${response.status}`);
    const data = await response.json();
    const reply = data.message?.content?.trim();
    console.log(`   [Ollama AI] Latency: ${Date.now() - start}ms -> "${reply}"`);
    return reply;
}

export async function queryLLM(messages) {
    if (env.GROQ_API_KEY) {
        try {
            const groqReply = await withTimeout(queryGroqRaw(messages), GROQ_TIMEOUT_MS, 'Groq API');
            if (groqReply) return groqReply;
        } catch (err) {
            console.warn(`   [Groq Warning]: ${err.message} -> Falling back to Ollama...`);
        }
    }

    try {
        const ollamaReply = await withTimeout(queryOllamaRaw(messages), OLLAMA_TIMEOUT_MS, 'Ollama Local');
        if (ollamaReply) return ollamaReply;
    } catch (err) {
        console.error(`   [Ollama Error]: ${err.message} -> Returning safe fallback line.`);
    }

    return FALLBACK_RESPONSE;
}

export async function warmUpOllama() {
    if (env.GROQ_API_KEY) return;
    console.log('   [Ollama] Warming up model (loading into memory)...');
    const start = Date.now();
    try {
        const response = await fetch(env.OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2',
                messages: [{ role: 'user', content: 'Hi' }],
                options: { num_predict: 1 },
                stream: false
            })
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        await response.json();
        console.log(`   [Ollama] Warm-up complete in ${Date.now() - start}ms.`);
    } catch (err) {
        console.warn('   [Ollama] Warm-up notice:', err.message);
    }
}
