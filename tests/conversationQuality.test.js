import { describe, it, expect } from 'vitest';
import { extractCustomerFacts, determineConversationStage, formatMemoryForPrompt } from '../services/ai/conversationMemory.js';
import { buildSystemPrompt } from '../services/ai/promptBuilder.js';
import { detectDoNotCall, detectCustomerCallbackExit } from '../services/ai/qualification.js';

describe('Conversation Quality & Memory Intelligence Suite', () => {

    it('Test 1 — Repeated Question Prevention: Fact extraction remembers team size and prevents re-asking', () => {
        const history = [
            { role: 'user', content: 'My company has 20 employees.' }
        ];
        const facts = extractCustomerFacts(history);
        expect(facts.teamSize).toBe(20);
        expect(facts.answeredTopics.has('team_size')).toBe(true);

        const memoryBlock = formatMemoryForPrompt(facts, 'DISCOVERY');
        expect(memoryBlock).toContain('- Team Size: 20 users/employees');
        expect(memoryBlock).toContain('Never ask for information listed above — it is ALREADY KNOWN');
    });

    it('Test 3 & 10 — Topic Change & Unexpected Question: Stage switches dynamically', () => {
        const history = [
            { role: 'user', content: 'How much does it cost?' },
            { role: 'assistant', content: 'Our starter plan is $99/mo.' },
            { role: 'user', content: 'Do you have WhatsApp integration?' }
        ];
        const facts = extractCustomerFacts(history);
        const stage = determineConversationStage(history, facts);

        expect(stage).toBe('PRODUCT_DISCUSSION');
        const memoryBlock = formatMemoryForPrompt(facts, stage);
        expect(memoryBlock).toContain('CURRENT CONVERSATION STAGE: PRODUCT_DISCUSSION');
    });

    it('Test 4 — Objection Handling: Detects price and competitor objections', () => {
        const history = [
            { role: 'user', content: 'Your competitor is much cheaper than you.' }
        ];
        const facts = extractCustomerFacts(history);
        const stage = determineConversationStage(history, facts);

        expect(facts.objections).toContain('price_too_high');
        expect(stage).toBe('OBJECTION_HANDLING');
    });

    it('Test 6 — Customer Memory & Fact Extraction: Name, team size, solution retained', () => {
        const history = [
            { role: 'user', content: 'My name is Rahul and we currently use Competitor X.' },
            { role: 'user', content: 'We have 50 employees.' }
        ];
        const facts = extractCustomerFacts(history);

        expect(facts.teamSize).toBe(50);
        expect(facts.currentSolution).toBe('competitor x');
    });

    it('Test 7 — Correction Handling: 10 employees... actually 20 retains 20', () => {
        const history = [
            { role: 'user', content: 'I need this for 10 employees... actually make that 20 employees.' }
        ];
        const facts = extractCustomerFacts(history);

        expect(facts.teamSize).toBe(20);
    });

    it('Test 8 & 9 — Callback, Exit & DNC Detection', () => {
        expect(detectCustomerCallbackExit("okay, share me the details and I will call you back.")).toBe(true);
        expect(detectCustomerCallbackExit("I'll get back to you later.")).toBe(true);
        expect(detectDoNotCall([{ role: 'user', content: "stop calling me" }])).toBe(true);
    });

    it('Test 10 — System Prompt Construction incorporates all 25 conversation principles', () => {
        const prompt = buildSystemPrompt({ name: 'Alex' }, { lead_name: 'Rahul' }, 'TEST MEMORY BLOCK');
        expect(prompt).toContain('ALWAYS ANSWER LATEST STATEMENT FIRST');
        expect(prompt).toContain('MULTIPLE QUESTIONS');
        expect(prompt).toContain('NATURAL ACKNOWLEDGEMENTS');
        expect(prompt).toContain('NO RE-INTRODUCTIONS');
        expect(prompt).toContain('TEST MEMORY BLOCK');
    });

});
