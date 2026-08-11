import { z } from 'zod';

export const agentSchema = z.object({
    id: z.string().nullable().optional(),
    name: z.string().min(2, 'Agent name must be at least 2 characters long'),
    company: z.string().min(2, 'Company name must be at least 2 characters long'),
    role_title: z.string().default('Sales Specialist'),
    tone_style: z.string().default('relaxed, warm, friendly'),
    call_goal: z.string().optional().default('Connect with lead and discover website needs'),
    first_message: z.string().min(10, 'First message greeting must be at least 10 characters long'),
    knowledge_base_context: z.string().optional().default(''),
    voice_engine: z.string().default('elevenlabs'),
    voice_id: z.string().default('JBFqnCBsd6RMkjVDRZzb')
});
