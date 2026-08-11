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
    "never call again"
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
