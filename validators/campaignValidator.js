import { z } from 'zod';

export const campaignStartSchema = z.object({
    name: z.string().optional().default('AI Outbound Outreach'),
    agent_id: z.string().min(1, 'Agent selection is required'),
    concurrency: z.number().min(1).max(20).default(5)
});
