import { z } from 'zod';

export const e164PhoneRegex = /^\+?[1-9]\d{7,14}$/;

export function validatePhoneNumber(phone) {
    if (!phone) return false;
    const clean = String(phone).replace(/[\s\-\(\)]/g, '');
    return e164PhoneRegex.test(clean);
}

export function formatE164(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[\s\-\(\)]/g, '');
    if (!clean.startsWith('+')) {
        clean = '+' + clean;
    }
    return clean;
}

export const manualLeadSchema = z.object({
    agent_id: z.string().min(1, 'Agent assignment is required'),
    lead_name: z.string().min(2, 'Customer name must be at least 2 characters long'),
    lead_phone: z.string().refine(val => validatePhoneNumber(val), {
        message: 'Invalid phone number format! Must include country code in E.164 format (e.g. +919876543210 or +14155552671)'
    }),
    lead_interest: z.string().optional().default('Restaurant Website Inquiry')
});
