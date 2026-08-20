import express from 'express';
import { validateTwilioWebhook } from '../middleware/twilioAuth.js';
import {
    handleVoiceConnect,
    handleCustomerRespond,
    handleStatusCallback,
    handleVoiceStream
} from '../controllers/webhookController.js';

const router = express.Router();

router.all('/voice', validateTwilioWebhook, handleVoiceConnect);
router.all('/voice-stream', validateTwilioWebhook, handleVoiceStream);
router.all('/respond', validateTwilioWebhook, handleCustomerRespond);
router.all('/status', validateTwilioWebhook, handleStatusCallback);
router.all('/ws/twilio', (req, res) => res.status(200).json({ status: 'ok', service: 'Pipecat Media Stream Endpoint' }));

export default router;

