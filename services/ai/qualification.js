import { z } from 'zod';
import { QUALIFICATIONS } from '../../config/constants.js';

export const structuredAiOutputSchema = z.object({
    response: z.string(),
    qualification: z.enum([
        QUALIFICATIONS.INTERESTED,
        QUALIFICATIONS.NOT_INTERESTED,
        QUALIFICATIONS.FOLLOW_UP,
        QUALIFICATIONS.UNKNOWN
    ]).default(QUALIFICATIONS.UNKNOWN),
    leadScore: z.number().min(0).max(100).default(0),
    confidence: z.number().min(0).max(1).default(0.5),
    intent: z.string().default('discovery'),
    decisionMaker: z.boolean().default(false),
    existingWebsite: z.boolean().default(false),
    websiteQuality: z.string().default('unknown'),
    pricingRequested: z.boolean().default(false),
    demoRequested: z.boolean().default(false),
    callbackRequested: z.boolean().default(false),
    humanHandoffRequested: z.boolean().default(false),
    doNotCall: z.boolean().default(false),
    notes: z.string().optional().default('')
});

const DNC_PHRASES = [
    "don't call me",
    "dont call me",
    "stop calling me",        // Specific: stop calling ME (not 'stop calling at 7pm')
    "stop all calls",
    "remove me from your list",
    "take me off your list",
    "no more calls",
    "do not contact me",
    "do not call me again",
    "unsubscribe",
    "never call again",
    "dont call me again"
    // NOTE: 'not interested' intentionally removed from DNC — it triggers analyzeCallQualification
    // NOT_INTERESTED qualification instead, without permanently blacklisting the lead
];

const CUSTOMER_CALLBACK_EXIT_PHRASES = [
    "call you back", "call back", "i'll get back", "ill get back",
    "i will get back", "get back to you", "call you later", "talk to you later",
    "call me back", "call me later", "call back later"
];

export function detectCustomerCallbackExit(userSpeech = '') {
    const lower = (userSpeech || '').toLowerCase();
    return CUSTOMER_CALLBACK_EXIT_PHRASES.some(phrase => lower.includes(phrase));
}

export function detectDoNotCall(history = []) {
    const fullText = history
        .filter(m => m.role === 'user')
        .map(m => m.content.toLowerCase())
        .join(' ');

    return DNC_PHRASES.some(phrase => fullText.includes(phrase));
}

// Only use explicit, unambiguous call-closing phrases that the AI will generate
// after an [END_CALL] signal. Avoid common conversational phrases like
// 'have a great day' or 'thanks' that can appear mid-conversation.
const CALL_END_PHRASES = [
    "[end_call]",
    "goodbye",
    "take care, bye",
    "bye for now",
    "talk to you soon, bye",
    "take care and goodbye",
    "have a great day, goodbye",
    "have a good day, goodbye",
    "have a great rest of your day"
];

export function detectCallEnd(aiSpeech = '', history = [], isDnc = false) {
    const speechLower = (aiSpeech || '').toLowerCase();
    const hasEndTag = speechLower.includes('[end_call]');
    const cleanedSpeech = (aiSpeech || '').replace(/\[end_call\]/gi, '').trim();

    if (isDnc || hasEndTag) {
        return { shouldHangup: true, cleanedSpeech };
    }

    const matchedClosingPhrase = CALL_END_PHRASES.some(phrase => speechLower.includes(phrase));
    if (matchedClosingPhrase) {
        return { shouldHangup: true, cleanedSpeech };
    }

    return { shouldHangup: false, cleanedSpeech };
}

export function parseStructuredAiOutput(rawJsonText) {
    try {
        let cleaned = rawJsonText.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
        }
        const json = JSON.parse(cleaned);
        const parsed = structuredAiOutputSchema.safeParse(json);
        if (parsed.success) {
            return parsed.data;
        }
        console.warn('⚠️ [AI Qualification] Zod parsing warning:', parsed.error.format());
    } catch (err) {
        console.warn('⚠️ [AI Qualification] JSON parse failed for raw output:', rawJsonText);
    }
    return null; // Signals retry needed
}

export function calculateLeadScore(data = {}) {
    let score = 20; // Base score
    if (data.decisionMaker) score += 20;
    if (data.demoRequested) score += 25;
    if (data.pricingRequested) score += 15;
    if (data.existingWebsite && data.websiteQuality === 'poor') score += 10;
    if (data.qualification === QUALIFICATIONS.INTERESTED) score += 10;
    if (data.qualification === QUALIFICATIONS.NOT_INTERESTED) score = 0;
    if (data.doNotCall) score = 0;
    return Math.min(100, Math.max(0, score));
}

const INTERESTED_PHRASES = [
    // Explicit interest / intent signals only — do NOT include common one-word acknowledgements
    // that match any speech ('yes', 'ok', 'sure', 'okay' — too generic for sales qualification)
    "interested",
    "sounds good", "sounds great", "sounds interesting",
    "tell me more", "how much", "price", "pricing", "cost",
    "demo", "book a demo", "schedule a demo",
    "schedule", "book",
    "send details", "send me", "email me", "send me details",
    "let's do it", "lets do it", "agreed", "sign me up",
    "definitely", "absolutely", "perfect", "deal",
    "i would like to", "i want to", "i'd like to",
    "sign up", "get started", "move forward", "proceed"
];

const NOT_INTERESTED_PHRASES = [
    "not interested", "no thanks", "don't need", "dont need", "don't want",
    "dont want", "nah", "pass", "stop calling", "bad time", "not looking",
    "already have one", "happy with current"
];

const FOLLOW_UP_PHRASES = [
    "call back", "call later", "call me later", "call me first", "call me",
    "call at", "call tomorrow", "call evening", "call in the", "busy",
    "can't talk", "cant talk", "talk later", "discuss later", "discuss on call",
    "next week", "think about it", "talk to my partner", "in office"
];

/**
 * Analyzes call conversation history to determine final lead qualification and score.
 * Prioritizes explicit callback requests (e.g. "call me at 7pm", "busy in office") to set Follow Up status.
 *
 * @param {Array} history - Session conversation history turns
 * @returns {{ qualification: string, leadScore: number, isDnc: boolean }}
 */
export function analyzeCallQualification(history = []) {
    const userMessages = (history || [])
        .filter(m => m.role === 'user')
        .map(m => String(m.content || '').toLowerCase().trim());

    if (userMessages.length === 0) {
        return { qualification: QUALIFICATIONS.UNKNOWN, leadScore: 20, isDnc: false };
    }

    const fullUserText = userMessages.join(' ');
    const recentUserText = userMessages.slice(-3).join(' ');

    // 1. Check Do Not Call / Strict Opt Out
    if (detectDoNotCall(history)) {
        return { qualification: QUALIFICATIONS.NOT_INTERESTED, leadScore: 0, isDnc: true };
    }

    let positiveCount = 0;
    let negativeCount = 0;
    let followUpCount = 0;

    FOLLOW_UP_PHRASES.forEach(p => {
        if (recentUserText.includes(p) || fullUserText.includes(p)) followUpCount++;
    });

    NOT_INTERESTED_PHRASES.forEach(p => {
        if (fullUserText.includes(p)) negativeCount++;
    });

    INTERESTED_PHRASES.forEach(p => {
        if (fullUserText.includes(p)) positiveCount++;
    });

    // Explicit rejection takes precedence
    if (negativeCount > positiveCount && negativeCount > 0) {
        return { qualification: QUALIFICATIONS.NOT_INTERESTED, leadScore: 10, isDnc: false };
    }

    // Explicit Follow-up / Callback / Busy request takes precedence over general positive answers
    const hasFollowUpSignal = followUpCount > 0 ||
        FOLLOW_UP_PHRASES.some(p => recentUserText.includes(p));

    if (hasFollowUpSignal) {
        return { qualification: QUALIFICATIONS.FOLLOW_UP, leadScore: 55, isDnc: false };
    }

    if (positiveCount > 0) {
        const leadScore = Math.min(100, 70 + (positiveCount * 10));
        return { qualification: QUALIFICATIONS.INTERESTED, leadScore, isDnc: false };
    }

    return { qualification: QUALIFICATIONS.FOLLOW_UP, leadScore: 40, isDnc: false };
}


