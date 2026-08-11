import express from 'express';
import { validateTwilioWebhook } from '../middleware/twilioAuth.js';
import {
    handleVoiceConnect,
    handleCustomerRespond,
    handleStatusCallback
} from '../controllers/webhookController.js';

const router = express.Router();

router.all('/voice', validateTwilioWebhook, handleVoiceConnect);
router.all('/respond', validateTwilioWebhook, handleCustomerRespond);
router.all('/status', validateTwilioWebhook, handleStatusCallback);

export default router;
