import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/rbac.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { ROLES } from '../config/constants.js';

import {
    getPlatformStats,
    getOrganizations,
    createOrganization,
    getOrganizationById,
    updateOrganization,
    suspendOrganization,
    activateOrganization,
    deleteOrganization,
    getAllUsersPlatform,
    createUserPlatform,
    suspendUserPlatform,
    activateUserPlatform,
    resetPasswordPlatform,
    getAuditLogsPlatform
} from '../controllers/superAdminController.js';

const router = express.Router();

router.use(apiLimiter);
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.SUPER_ADMIN));

// Platform Overview Stats
router.get('/stats', getPlatformStats);

// Organizations Management
router.get('/organizations', getOrganizations);
router.post('/organizations', createOrganization);
router.get('/organizations/:id', getOrganizationById);
router.put('/organizations/:id', updateOrganization);
router.post('/organizations/:id/suspend', suspendOrganization);
router.post('/organizations/:id/activate', activateOrganization);
router.delete('/organizations/:id', deleteOrganization);

// Users Management (Platform-wide)
router.get('/users', getAllUsersPlatform);
router.post('/users', createUserPlatform);
router.post('/users/:id/suspend', suspendUserPlatform);
router.post('/users/:id/activate', activateUserPlatform);
router.post('/users/:id/reset-password', resetPasswordPlatform);

// Audit Logs
router.get('/audit-logs', getAuditLogsPlatform);

export default router;
