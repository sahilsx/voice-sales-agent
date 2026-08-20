import { env } from '../config/env.js';
import { ERROR_CODES } from '../config/constants.js';

export function validateInternalApiKey(req, res, next) {
    const apiKey = req.headers['x-internal-api-key'] || req.query.internal_key;
    const expectedKey = env.INTERNAL_API_KEY || 'internal_secret_key_123';

    if (!apiKey || apiKey !== expectedKey) {
        console.warn(`⚠️ [Internal Auth] Unauthorized access attempt from IP ${req.ip}`);
        return res.status(401).json({
            success: false,
            error: {
                code: ERROR_CODES.UNAUTHORIZED,
                message: 'Invalid or missing internal API key.'
            }
        });
    }

    next();
}
