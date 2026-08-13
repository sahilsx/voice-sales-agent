import { describe, it, expect } from 'vitest';
import { analyzeCallQualification } from '../services/ai/qualification.js';
import { QUALIFICATIONS } from '../config/constants.js';

describe('Call Qualification & Lead Status Analysis', () => {
    it('correctly qualifies lead as Interested when positive signals are present', () => {
        const history = [
            { role: 'assistant', content: 'Hey Sahil, how are you?' },
            { role: 'user', content: 'I am good, yes I am interested in your services!' },
            { role: 'assistant', content: 'Great! Should I send you the pricing details?' },
            { role: 'user', content: 'Yes please, send me details and pricing.' }
        ];

        const result = analyzeCallQualification(history);
        expect(result.qualification).toBe(QUALIFICATIONS.INTERESTED);
        expect(result.leadScore).toBeGreaterThanOrEqual(70);
        expect(result.isDnc).toBe(false);
    });

    it('correctly qualifies lead as Not Interested when rejection signals are present', () => {
        const history = [
            { role: 'assistant', content: 'Hi Sahil, following up on our chat.' },
            { role: 'user', content: 'No thanks, I am not interested at all.' }
        ];

        const result = analyzeCallQualification(history);
        expect(result.qualification).toBe(QUALIFICATIONS.NOT_INTERESTED);
    });

    it('correctly flags DNC when stop calling is requested', () => {
        const history = [
            { role: 'assistant', content: 'Hello!' },
            { role: 'user', content: 'Please stop calling me and remove me from your list.' }
        ];

        const result = analyzeCallQualification(history);
        expect(result.qualification).toBe(QUALIFICATIONS.NOT_INTERESTED);
        expect(result.isDnc).toBe(true);
        expect(result.leadScore).toBe(0);
    });

    it('qualifies as Follow Up when user requests to call back later', () => {
        const history = [
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'I am busy right now, call back tomorrow.' }
        ];

        const result = analyzeCallQualification(history);
        expect(result.qualification).toBe(QUALIFICATIONS.FOLLOW_UP);
    });

    it('correctly qualifies lead as Follow Up Needed when user requests callback at 7pm despite earlier yes answers', () => {
        const history = [
            { role: 'assistant', content: 'Hey sahil, I am Sarah...' },
            { role: 'user', content: "I'm doing great." },
            { role: 'user', content: "Yes." },
            { role: 'user', content: "Investment." },
            { role: 'user', content: "Approximately 1 CR." },
            { role: 'user', content: "Yes. Can can, can we talk an evening correctly? I am busy in office so I can't talk. More here." },
            { role: 'user', content: "No, no, you can call me first at, uh, 7 p.m. we will. Discuss on call then. Okay, thank you." }
        ];

        const result = analyzeCallQualification(history);
        expect(result.qualification).toBe(QUALIFICATIONS.FOLLOW_UP);
    });
});
