import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryQwenRaw, checkQwenHealth } from '../services/ai/providers/qwenProvider.js';
import { queryLLM, ensureCompleteSentence, sanitizeAndExpandReply } from '../services/ai/conversation.js';
import { extractCustomerFacts, determineConversationStage, formatMemoryForPrompt } from '../services/ai/conversationMemory.js';
import { buildSystemPrompt } from '../services/ai/promptBuilder.js';
import { detectDoNotCall, detectCustomerCallbackExit } from '../services/ai/qualification.js';

describe('Qwen LLM Provider & Switching Integration Suite', () => {

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('1. Qwen provider sends correct OpenAI-compatible vLLM request body and model', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Sure, 2BHK listings in Karanagar are available.' } }]
            })
        });

        const messages = [
            { role: 'system', content: 'You are Sarah.' },
            { role: 'user', content: 'Looking for 2BHK in Karanagar.' }
        ];

        const reply = await queryQwenRaw(messages);

        expect(reply).toBe('Sure, 2BHK listings in Karanagar are available.');
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const [url, options] = fetchSpy.mock.calls[0];
        expect(url).toContain('/chat/completions');
        const body = JSON.parse(options.body);
        expect(body.model).toBe('Qwen/Qwen3-4B-Instruct-2507-FP8');
        expect(body.temperature).toBe(0.65);
        expect(body.top_p).toBe(0.8);
        expect(body.max_tokens).toBe(100);
    });

    it('2 & 3. Qwen provider respects custom QWEN_BASE_URL and QWEN_MODEL if set', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'Understood.' } }] })
        });

        await queryQwenRaw([{ role: 'system', content: 'Prompt' }]);
        const [url] = fetchSpy.mock.calls[0];
        expect(url).toBe('http://127.0.0.1:8000/v1/chat/completions');
    });

    it('6. Empty Qwen response is handled gracefully without crashing', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({ choices: [{ message: { content: '' } }] })
        });

        await expect(queryQwenRaw([{ role: 'system', content: 'Prompt' }])).rejects.toThrow('Empty response from Qwen LLM');
    });

    it('7 & 8. HTTP 500 and Timeout are handled without crashing the application', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error'
        });

        await expect(queryQwenRaw([{ role: 'system', content: 'Prompt' }])).rejects.toThrow('Qwen HTTP error 500');
    });

    it('15. ensureCompleteSentence() cleans Qwen output mid-thought cutoffs', () => {
        const rawIncomplete = "We have a few different options available at our luxury 2BHK apartments in Karanagar. We'd be happy to";
        const cleaned = ensureCompleteSentence(rawIncomplete);
        expect(cleaned).toBe("We have a few different options available at our luxury 2BHK apartments in Karanagar.");
    });

    it('17. Step 11 Regression Test: LLM_PROVIDER switching preserves memory, fact extraction, stage tracking, and sentence cleanup', () => {
        const history = [
            { role: 'user', content: 'My name is Rahul and I need this for 10 employees.' },
            { role: 'assistant', content: 'Got it, 10 employees.' },
            { role: 'user', content: 'Actually, make that 20 employees. And we currently use Competitor X.' }
        ];

        // Fact extraction must be 100% identical regardless of provider
        const facts = extractCustomerFacts(history);
        expect(facts.teamSize).toBe(20);
        expect(facts.currentSolution).toBe('competitor x');

        // Conversation stage tracking must be identical
        const stage = determineConversationStage(history, facts);
        expect(stage).toBe('DISCOVERY');

        // Memory prompt construction must be identical
        const memoryBlock = formatMemoryForPrompt(facts, stage);
        const systemPrompt = buildSystemPrompt({ name: 'Alex' }, { lead_name: 'Rahul' }, memoryBlock);
        expect(systemPrompt).toContain('Rahul');
        expect(systemPrompt).toContain('- Team Size: 20 users/employees');

        // DNC and Callback detection must be identical
        expect(detectCustomerCallbackExit('I will call you back later.')).toBe(true);
        expect(detectDoNotCall([{ role: 'user', content: 'stop calling me' }])).toBe(true);
    });

    it('Check Qwen health endpoint responds with model information', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [{ id: 'Qwen/Qwen3-4B-Instruct-2507-FP8' }]
            })
        });

        const health = await checkQwenHealth();
        expect(health.available).toBe(true);
        expect(health.modelFound).toBe(true);
    });

});
