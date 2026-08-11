import { rateLimit } from 'express-rate-limit';
import { ERROR_CODES } from '../config/constants.js';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10, // 10 login requests per window
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Too many authentication attempts. Please try again after 15 minutes.'
        }
    }
});

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100, // 100 requests per 15 mins
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'API rate limit exceeded. Please slow down.'
        }
    }
});

export const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20, // 20 file uploads per 15 mins
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'File upload rate limit exceeded.'
        }
    }
});
