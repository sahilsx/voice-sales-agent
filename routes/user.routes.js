import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/rbac.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { ROLES } from '../config/constants.js';

import {
    getUsers,
    createUser,
    suspendUser,
    activateUser,
    resetPassword
} from '../controllers/userController.js';

const router = express.Router();

router.use(apiLimiter);
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN));

router.get('/', getUsers);
router.post('/', createUser);
router.post('/:id/suspend', suspendUser);
router.post('/:id/activate', activateUser);
router.post('/:id/reset-password', resetPassword);

export default router;
