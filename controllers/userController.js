import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { ROLES, USER_STATUSES, ERROR_CODES } from '../config/constants.js';
import { logAuditEvent } from '../services/auditService.js';

// GET /api/users
export async function getUsers(req, res, next) {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);

        let query = { status: { $ne: USER_STATUSES.DELETED } };

        if (req.user.role === ROLES.SUPER_ADMIN) {
            if (req.query.organizationId) {
                query.organizationId = req.query.organizationId;
            }
        } else if (req.user.role === ROLES.ADMIN) {
            query.organizationId = req.user.organizationId;
        } else {
            return res.status(403).json({
                success: false,
                error: { code: ERROR_CODES.FORBIDDEN, message: 'Only Organization Admins can manage users.' }
            });
        }

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .select('-passwordHash')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({
            success: true,
            data: users,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/users
export async function createUser(req, res, next) {
    try {
        const { name, email, password, role } = req.body;

        if (req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.ADMIN) {
            return res.status(403).json({
                success: false,
                error: { code: ERROR_CODES.FORBIDDEN, message: 'Only Organization Admins can create users.' }
            });
        }

        if (role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
            return res.status(403).json({
                success: false,
                error: { code: ERROR_CODES.FORBIDDEN, message: 'Organization Admins cannot create Super Admin accounts.' }
            });
        }
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Name, email, and password are required' }
            });
        }

        const orgId = req.user.role === ROLES.SUPER_ADMIN ? (req.body.organizationId || req.user.organizationId) : req.user.organizationId;

        // Enforce maxUsers limit
        if (orgId) {
            const org = await findOrgByCustomId(orgId);
            if (org) {
                const currentCount = await User.countDocuments({ organizationId: orgId, status: { $ne: USER_STATUSES.DELETED } });
                const maxUsers = org.limits?.maxUsers || 50;
                if (currentCount >= maxUsers) {
                    return res.status(400).json({
                        success: false,
                        error: { code: ERROR_CODES.USER_LIMIT_REACHED, message: `This organization has reached its maximum user limit of ${maxUsers}.` }
                    });
                }
            }
        }

        const existing = await User.findOne({ email: email.trim().toLowerCase() });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: ERROR_CODES.DUPLICATE_RESOURCE, message: 'A user with this email already exists' }
            });
        }

        const passwordHash = await User.hashPassword(password);
        const newUser = await User.create({
            id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            organizationId: orgId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            passwordHash,
            role: role || ROLES.AGENT,
            status: USER_STATUSES.ACTIVE
        });

        await logAuditEvent({
            organizationId: orgId || 'platform',
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'USER_CREATE',
            resource: 'USER',
            resourceId: newUser.id,
            ip: req.ip
        });

        res.json({
            success: true,
            data: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                status: newUser.status,
                organizationId: newUser.organizationId
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/users/:id/suspend
export async function suspendUser(req, res, next) {
    try {
        const query = { id: req.params.id, status: { $ne: USER_STATUSES.DELETED } };
        if (req.user.role !== ROLES.SUPER_ADMIN) {
            query.organizationId = req.user.organizationId;
        }

        const user = await User.findOneAndUpdate(query, { status: USER_STATUSES.SUSPENDED }, { new: true }).select('-passwordHash').lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'User not found in your organization' }
            });
        }

        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
}

// POST /api/users/:id/activate
export async function activateUser(req, res, next) {
    try {
        const query = { id: req.params.id, status: { $ne: USER_STATUSES.DELETED } };
        if (req.user.role !== ROLES.SUPER_ADMIN) {
            query.organizationId = req.user.organizationId;
        }

        const user = await User.findOneAndUpdate(query, { status: USER_STATUSES.ACTIVE }, { new: true }).select('-passwordHash').lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'User not found in your organization' }
            });
        }

        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
}

// POST /api/users/:id/reset-password
export async function resetPassword(req, res, next) {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Password must be at least 6 characters' }
            });
        }

        const query = { id: req.params.id, status: { $ne: USER_STATUSES.DELETED } };
        if (req.user.role !== ROLES.SUPER_ADMIN) {
            query.organizationId = req.user.organizationId;
        }

        const user = await User.findOne(query);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'User not found in your organization' }
            });
        }

        user.passwordHash = await User.hashPassword(newPassword);
        await user.save();

        res.json({ success: true, data: { message: 'Password reset successfully' } });
    } catch (err) {
        next(err);
    }
}
