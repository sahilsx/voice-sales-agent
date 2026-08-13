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
    "stop calling",
    "remove me",
    "take me off your list",
    "no more calls",
    "do not contact me",
    "unsubscribe",
    "never call again",
    "i am not interested",
    "i am not interested in this project",
    "i am not interested in this service",
    "not interested",
    "dont call me again"
];

export function detectDoNotCall(history = []) {
    const fullText = history
        .filter(m => m.role === 'user')
        .map(m => m.content.toLowerCase())
        .join(' ');

    return DNC_PHRASES.some(phrase => fullText.includes(phrase));
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
    "yes", "yeah", "yep", "sure", "interested", "sounds good", "sounds great",
    "tell me more", "how much", "price", "pricing", "cost", "demo", "book",
    "schedule", "send details", "send me", "email me",
    "let's do it", "lets do it", "okay", "ok", "agreed", "sign me up",
    "definitely", "absolutely", "perfect", "deal"
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

    if (positiveCount > 0 || userMessages.length >= 3) {
        const leadScore = Math.min(100, 70 + (positiveCount * 10));
        return { qualification: QUALIFICATIONS.INTERESTED, leadScore, isDnc: false };
    }

    return { qualification: QUALIFICATIONS.FOLLOW_UP, leadScore: 40, isDnc: false };
}


