import { describe, it, expect } from 'vitest';
import { parseStructuredAiOutput, calculateLeadScore } from '../services/ai/qualification.js';

describe('Structured AI JSON Output & Lead Scoring Tests', () => {
    it('should parse valid structured JSON AI outputs', () => {
        const rawJson = `\`\`\`json
        {
            "response": "Oh gotcha! Do you currently have a mobile menu site?",
            "qualification": "Interested",
            "leadScore": 75,
            "confidence": 0.9,
            "intent": "discovery",
            "decisionMaker": true,
            "existingWebsite": false,
            "pricingRequested": false,
            "demoRequested": true,
            "callbackRequested": false,
            "humanHandoffRequested": false,
            "doNotCall": false
        }
        \`\`\``;

        const parsed = parseStructuredAiOutput(rawJson);
        expect(parsed).not.toBeNull();
        expect(parsed.qualification).toBe('Interested');
        expect(parsed.decisionMaker).toBe(true);
        expect(parsed.demoRequested).toBe(true);
    });

    it('should calculate accurate lead score based on metrics', () => {
        const score = calculateLeadScore({
            qualification: 'Interested',
            decisionMaker: true,
            demoRequested: true
        });
        expect(score).toBeGreaterThanOrEqual(65);
    });
});
