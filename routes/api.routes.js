import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/rbac.js';
import { apiLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { ROLES } from '../config/constants.js';

import {
    getAgents,
    createOrUpdateAgent,
    deleteAgent
} from '../controllers/agentController.js';

import {
    getLeads,
    addManualLead,
    uploadLeadsFile,
    toggleDoNotCall,
    deleteLead,
    deleteAllLeads
} from '../controllers/leadController.js';

import {
    triggerSingleLeadCall,
    startCampaign,
    getCampaigns
} from '../controllers/campaignController.js';

import {
    getLogs,
    deleteLog,
    deleteAllLogs
} from '../controllers/logController.js';

import { getOrgStats } from '../controllers/statsController.js';

const router = express.Router();

// Setup Multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Protect all API routes with JWT authentication & rate limiting
router.use(apiLimiter);
router.use(authenticateToken);

// ---------------------------------------------------------------------
// AGENTS API
// ---------------------------------------------------------------------
router.get('/agents', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.VIEWER), getAgents);
router.post('/agents', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER), createOrUpdateAgent);
router.delete('/agents/:id', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER), deleteAgent);

// ---------------------------------------------------------------------
// LEADS API & EXCEL/CSV UPLOAD
// ---------------------------------------------------------------------
router.get('/leads', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.VIEWER), getLeads);
router.post('/leads/manual', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT), addManualLead);
router.post('/leads/upload', uploadLimiter, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT), upload.single('file'), uploadLeadsFile);
router.patch('/leads/:id/dnc', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT), toggleDoNotCall);
router.delete('/leads/:id', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER), deleteLead);
router.delete('/leads', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER), deleteAllLeads);

// ---------------------------------------------------------------------
// CAMPAIGNS API
// ---------------------------------------------------------------------
router.get('/campaigns', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.VIEWER), getCampaigns);
router.post('/campaigns/trigger-lead', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT), triggerSingleLeadCall);
router.post('/campaigns/start', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER), startCampaign);

// ---------------------------------------------------------------------
// CALL LOGS & TRANSCRIPTS API
// ---------------------------------------------------------------------
router.get('/logs', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.VIEWER), getLogs);
router.delete('/logs/:callSid', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER), deleteLog);
router.delete('/logs', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER), deleteAllLogs);

// ---------------------------------------------------------------------
// DASHBOARD STATS — lightweight aggregation, no full collection fetches
// ---------------------------------------------------------------------
router.get('/stats', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.VIEWER), getOrgStats);

export default router;
