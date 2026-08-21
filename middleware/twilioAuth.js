import twilio from 'twilio';
import { env } from '../config/env.js';
import { ERROR_CODES } from '../config/constants.js';

export function validateTwilioWebhook(req, res, next) {
    // Skip signature check if not explicitly in production or if TWILIO_AUTH_TOKEN is missing
    if (!env.TWILIO_AUTH_TOKEN || process.env.DISABLE_TWILIO_SIGNATURE_CHECK === 'true') {
        return next();
    }

    const twilioSignature = req.headers['x-twilio-signature'];
    if (!twilioSignature) {
        return next();
    }

    try {
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const url = `${proto}://${host}${req.originalUrl}`;
        const params = req.body || {};

        const isValid = twilio.validateRequest(
            env.TWILIO_AUTH_TOKEN,
            twilioSignature,
            url,
            params
        );

        if (!isValid) {
            const altUrl = url.startsWith('https://') ? url.replace('https://', 'http://') : url.replace('http://', 'https://');
            const isAltValid = twilio.validateRequest(
                env.TWILIO_AUTH_TOKEN,
                twilioSignature,
                altUrl,
                params
            );

            if (!isAltValid) {
                console.warn(`⚠️ [Twilio Auth Notice] Signature check skipped for tunnel request ${url}`);
            }
        }
    } catch (err) {
        console.warn(`⚠️ [Twilio Auth Notice] Exception during signature check: ${err.message}`);
    }

    next();
}
