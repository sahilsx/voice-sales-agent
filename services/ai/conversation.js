import { env } from '../../config/env.js';

const OLLAMA_TIMEOUT_MS = 8000;
const GROQ_TIMEOUT_MS = 5000;
const FALLBACK_RESPONSE = "I'm sorry, I didn't quite catch that. Could you say that again?";

function withTimeout(promise, ms, label = 'operation') {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function extractCleanReply(data) {
    const msg = data.choices?.[0]?.message;
    if (!msg) return '';

    let content = msg.content || '';
    content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();

    // Must be a valid conversational turn (not empty, not just a system tag)
    if (content && content.length > 3 && !/^(\[.*?\]|\W+)$/.test(content)) {
        return content;
    }

    // For reasoner models, only extract if explicitly marked as output/response
    if (msg.reasoning) {
        const outputMatch = msg.reasoning.match(/(?:respond|answer|say|output|phrase|reply)\s*:\s*\"([^\"]{5,120})\"/i);
        if (outputMatch && outputMatch[1]) {
            const quote = outputMatch[1].trim();
            // Filter out system rule keywords
            if (!/^(interested|how much|send me details|sounds good|yes|ok|okay)$/i.test(quote)) {
                return quote;
            }
        }
    }
    return '';
}

async function queryGroqRaw(messages) {
    if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing');
    const start = Date.now();
    const systemPrompt = messages[0];
    const recentHistory = messages.slice(1).slice(-8);
    const pruned = [systemPrompt, ...recentHistory];

    const modelsToTry = ['groq/compound-mini', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    for (const model of modelsToTry) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: pruned,
                        max_tokens: 60,
                        temperature: 0.4
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const reply = extractCleanReply(data);
                    if (reply) {
                        console.log(`   [Groq AI] Model: ${model} | Latency: ${Date.now() - start}ms -> "${reply}"`);
                        return reply;
                    }
                } else if (response.status === 429) {
                    const backoffMs = attempt * 300;
                    console.warn(`   [Groq Notice] Model ${model} rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt}/3)...`);
                    await new Promise(r => setTimeout(r, backoffMs));
                } else {
                    console.warn(`   [Groq Notice] Model ${model} status ${response.status}`);
                    break;
                }
            } catch (err) {
                console.warn(`   [Groq Notice] Model ${model} error: ${err.message}`);
                break;
            }
        }
    }

    throw new Error('All Groq API models failed or rate limited');
}

async function queryOllamaRaw(messages) {
    const start = Date.now();
    const systemPrompt = messages[0];
    // Keep last 12 turns (was 4) so the AI remembers what the customer already answered
    const recentHistory = messages.slice(1).slice(-12);
    const pruned = [systemPrompt, ...recentHistory];

    const response = await fetch(env.OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3.2',
            messages: pruned,
            options: { num_predict: 50, temperature: 0.7 }, // was 35/0.5
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
