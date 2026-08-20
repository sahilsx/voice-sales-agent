import express from 'express';
import { validateInternalApiKey } from '../middleware/internalAuth.js';
import { getRuntimeConfig, handleCallComplete } from '../controllers/internalController.js';

const router = express.Router();

router.use(validateInternalApiKey);

router.get('/runtime-config', getRuntimeConfig);
router.post('/call-complete', handleCallComplete);

export default router;
