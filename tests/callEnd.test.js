import { describe, it, expect } from 'vitest';
import { detectCallEnd } from '../services/ai/qualification.js';
import { buildGoodbyeTwiml } from '../services/telephony/twilioService.js';

describe('Agent Call Termination Tests', () => {
    it('should detect explicit [END_CALL] tag and strip it', () => {
        const result = detectCallEnd('Awesome, I have booked your demo for 3 PM tomorrow. Have a great day! [END_CALL]');
        expect(result.shouldHangup).toBe(true);
        expect(result.cleanedSpeech).toBe('Awesome, I have booked your demo for 3 PM tomorrow. Have a great day!');
    });

    it('should detect closing farewell phrases as call termination signals', () => {
        const result1 = detectCallEnd('Thanks for your time, goodbye!');
        expect(result1.shouldHangup).toBe(true);

        const result2 = detectCallEnd('Have a great rest of your day!');
        expect(result2.shouldHangup).toBe(true);
    });

    it('should not hangup on regular ongoing conversation responses', () => {
        const result = detectCallEnd('What is the best email to send the menu details to?');
        expect(result.shouldHangup).toBe(false);
        expect(result.cleanedSpeech).toBe('What is the best email to send the menu details to?');
    });

    it('should generate TwiML with <Hangup/> tag', () => {
        const twiml = buildGoodbyeTwiml({ sayText: 'Goodbye!' });
        expect(twiml).toContain('<Hangup/>');
        expect(twiml).toContain('<Say voice="Polly.Joanna">Goodbye!</Say>');
    });
});
