import { env } from '../../config/env.js';
import { extractCustomerFacts, determineConversationStage } from './conversationMemory.js';

const OLLAMA_TIMEOUT_MS = 2500;
const GROQ_TIMEOUT_MS = 3500;

function withTimeout(promise, ms, label = 'operation') {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function getSmartFallbackForTurn(history = []) {
    const facts = extractCustomerFacts(history);
    const stage = determineConversationStage(history, facts);
    const lastUserMsg = (history.filter(m => m.role === 'user').pop()?.content || '').toLowerCase();

    if (/investment|self use|own use|home/i.test(lastUserMsg)) {
        return 'Got it! What budget range are you considering for this investment?';
    }
    if (/day|days|week|month|soon|now|urgent|4 days|3 days/i.test(lastUserMsg)) {
        return 'Understood! Would you like to schedule a quick site visit before making your decision?';
    }
    if (/price|cost|how much|budget|pricing|rate/i.test(lastUserMsg)) {
        return 'Our units are priced very competitively. Would you like me to text you the detailed pricing breakdown?';
    }
    if (/karanagar|downtown|2bhk|3bhk|location/i.test(lastUserMsg)) {
        return 'We have prime 2BHK listings available right now. When would be a good time to view them?';
    }
    if (stage === 'CLOSING' || stage === 'CALLBACK_OR_TEXT_REQUESTED') {
        return 'Great! I will text you all the details right away so you can review them. Have a great day! [END_CALL]';
    }
    return 'Got it! What is the main feature or detail you are looking for in your property?';
}

export function sanitizeAndExpandReply(reply, history = []) {
    if (!reply || reply.length < 3) {
        return getSmartFallbackForTurn(history);
    }
    const clean = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/\[(?!END_CALL\])[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim();
    const wordCount = clean.split(/\s+/).length;

    // Single-word responses like "Understood" leave customer hanging — expand them naturally
    if (wordCount <= 2 && !/\[END_CALL\]/i.test(clean)) {
        const fallback = getSmartFallbackForTurn(history);
        const strippedFallback = fallback.replace(/^(got it|understood|sure|okay|right)\s*!?,?\s*/i, '');
        return `${clean}! ${strippedFallback}`;
    }
    return clean;
}

function extractCleanReply(data) {
    const msg = data.choices?.[0]?.message;
    if (!msg) return '';

    let content = msg.content || '';
    content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();

    if (content && content.length > 3 && !/^(\[.*?\]|\W+)$/.test(content)) {
        return content;
    }

    if (msg.reasoning) {
        const outputMatch = msg.reasoning.match(/(?:respond|answer|say|output|phrase|reply)\s*:\s*\"([^\"]{5,120})\"/i);
        if (outputMatch && outputMatch[1]) {
            const quote = outputMatch[1].trim();
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
    const recentHistory = messages.slice(1).slice(-4);
    const pruned = [systemPrompt, ...recentHistory];

    const modelsToTry = ['groq/compound-mini', 'openai/gpt-oss-120b'];
    for (const model of modelsToTry) {
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
                    max_tokens: 50,
                    temperature: 0.4
                })
            });

            if (response.ok) {
                const data = await response.json();
                const rawReply = extractCleanReply(data);
                if (rawReply) {
                    const reply = sanitizeAndExpandReply(rawReply, messages);
                    console.log(`   [Groq AI] Model: ${model} | Latency: ${Date.now() - start}ms -> "${reply}"`);
                    return reply;
                }
            } else if (response.status === 429) {
                console.warn(`   [Groq Notice] Model ${model} rate limited / TPD exhausted (429). Falling back to next model...`);
            } else {
                console.warn(`   [Groq Notice] Model ${model} status ${response.status}`);
            }
        } catch (err) {
            console.warn(`   [Groq Notice] Model ${model} error: ${err.message}`);
        }
    }

    throw new Error('All Groq API models failed or rate limited');
}

async function queryOllamaRaw(messages) {
    const start = Date.now();
    const systemPrompt = messages[0];
    const recentHistory = messages.slice(1).slice(-4);
    const pruned = [systemPrompt, ...recentHistory];

    const ollamaPromise = (async () => {
        const response = await fetch(env.OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2',
                messages: pruned,
                options: {
                    num_predict: 25,
                    temperature: 0.3,
                    num_thread: 8
                },
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama HTTP error ${response.status}`);
        }

        const data = await response.json();
        let rawReply = data.message?.content?.trim() || '';
        if (!rawReply) {
            throw new Error('Empty response from Ollama');
        }

        const reply = sanitizeAndExpandReply(rawReply, messages);
        console.log(`   [Ollama AI] Latency: ${Date.now() - start}ms -> "${reply}"`);
        return reply;
    })();

    return await withTimeout(ollamaPromise, OLLAMA_TIMEOUT_MS, 'Ollama Local');
}

export async function queryLLM(messages) {
    try {
        return await withTimeout(queryGroqRaw(messages), GROQ_TIMEOUT_MS, 'Groq API');
    } catch (err) {
        console.warn(`   [Groq Warning]: ${err.message} -> Falling back to Ollama...`);
        try {
            return await queryOllamaRaw(messages);
        } catch (ollamaErr) {
            console.warn(`   [Ollama Fallback]: ${ollamaErr.message} -> Using Smart Response Engine`);
            return getSmartFallbackForTurn(messages);
        }
    }
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
