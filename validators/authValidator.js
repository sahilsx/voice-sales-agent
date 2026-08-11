import { z } from 'zod';
import { ROLES } from '../config/constants.js';

export const loginSchema = z.object({
    email: z.string().email('Invalid email address format'),
    password: z.string().min(6, 'Password must be at least 6 characters')
});

export const createUserSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(Object.values(ROLES)).default(ROLES.AGENT)
});
