import twilio from 'twilio';
import { env } from '../config/env.js';
import { ERROR_CODES } from '../config/constants.js';

export function validateTwilioWebhook(req, res, next) {
    // Skip signature check in development/testing mode unless explicitly set to production
    if (env.NODE_ENV !== 'production') {
        return next();
    }

    const twilioSignature = req.headers['x-twilio-signature'];
    if (!twilioSignature) {
        return res.status(403).json({
            success: false,
            error: {
                code: ERROR_CODES.FORBIDDEN,
                message: 'Twilio signature header missing'
            }
        });
    }

    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = req.body;

    const isValid = twilio.validateRequest(
        env.TWILIO_AUTH_TOKEN,
        twilioSignature,
        url,
        params
    );

    if (!isValid) {
        console.warn(`⚠️ [Twilio Security] Signature validation failed for request to ${url}`);
        return res.status(403).json({
            success: false,
            error: {
                code: ERROR_CODES.FORBIDDEN,
                message: 'Twilio signature validation failed'
            }
        });
    }

    next();
}
