import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default('3000').transform(val => parseInt(val, 10)),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

    SUPER_ADMIN_EMAIL: z.string().email().default('superadmin@voiceai.com'),
    SUPER_ADMIN_PASSWORD: z.string().default('SuperAdmin@123456'),

    // Twilio credentials must come from .env
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),

    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().default('JBFqnCBsd6RMkjVDRZzb'),

    GROQ_API_KEY: z.string().optional(),

    OLLAMA_URL: z.string().default('http://localhost:11434/api/chat'),

    REDIS_HOST: z.string().default('127.0.0.1'),
    REDIS_PORT: z.string().default('6379').transform(val => parseInt(val, 10)),

    // Pipecat Voice Orchestration & Internal Security
    INTERNAL_API_KEY: z.string().default('internal_secret_key_123'),
    PIPECAT_SERVICE_URL: z.string().optional(),
    DEEPGRAM_API_KEY: z.string().optional(),
    USE_PIPECAT_FOR_CALLS: z.string().optional().transform(val => val === 'true'),

    // Production Custom Public URL (skips Ngrok when set)
    PUBLIC_TUNNEL_URL: z.string().optional()
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error(
        '❌ Environment configuration error:',
        parsedEnv.error.format()
    );
    process.exit(1);
}

export const env = parsedEnv.data;