import { describe, it, expect } from 'vitest';
import { detectDoNotCall } from '../services/ai/qualification.js';

describe('DNC Phrase Detection Tests', () => {
    it('should detect explicit opt-out phrases in conversation history', () => {
        const history1 = [
            { role: 'assistant', content: 'Hi, this is Alex from Horizon Realty.' },
            { role: 'user', content: 'Please stop calling me!' }
        ];
        expect(detectDoNotCall(history1)).toBe(true);
        const history2 = [
            { role: 'assistant', content: 'Hello!' },
            { role: 'user', content: 'Take me off your list right now' }
        ];
        expect(detectDoNotCall(history2)).toBe(true);
    });

    it('should return false for normal customer responses', () => {
        const history = [
            { role: 'assistant', content: 'Hi!' },
            { role: 'user', content: 'Yes, tell me more about the 3BHK apartment.' }
        ];
        expect(detectDoNotCall(history)).toBe(false);
    });
});
