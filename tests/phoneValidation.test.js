import { describe, it, expect } from 'vitest';
import { validatePhoneNumber, formatE164 } from '../validators/leadValidator.js';

describe('E.164 Phone Number Validation Tests', () => {
    it('should validate valid E.164 phone numbers with country code', () => {
        expect(validatePhoneNumber('+917780922090')).toBe(true);
        expect(validatePhoneNumber('+14155552671')).toBe(true);
        expect(validatePhoneNumber('+442079460912')).toBe(true);
    });

    it('should format non-plus prefixed international numbers', () => {
        expect(formatE164('917780922090')).toBe('+917780922090');
    });

    it('should reject invalid or short phone numbers', () => {
        expect(validatePhoneNumber('123')).toBe(false);
        expect(validatePhoneNumber('abc12345')).toBe(false);
        expect(validatePhoneNumber('')).toBe(false);
    });
});
