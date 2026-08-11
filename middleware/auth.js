import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { findOrgByCustomId } from '../services/organizationService.js';
import { ERROR_CODES, ROLES, ORG_STATUSES, USER_STATUSES } from '../config/constants.js';

export async function authenticateToken(req, res, next) {
    let token = null;

    // Check Authorization Header (Bearer <token>)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            error: {
                code: ERROR_CODES.UNAUTHORIZED,
                message: 'Authentication token missing or invalid'
            }
        });
    }

    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        const user = await User.findOne({ id: decoded.userId }).lean();

        if (!user || user.status === USER_STATUSES.DELETED) {
            return res.status(401).json({
                success: false,
                error: {
                    code: ERROR_CODES.UNAUTHORIZED,
                    message: 'Authenticated user no longer exists'
                }
            });
        }

        if (user.status === USER_STATUSES.SUSPENDED) {
            return res.status(403).json({
                success: false,
                error: {
                    code: ERROR_CODES.USER_SUSPENDED,
                    message: 'Your user account has been suspended by an administrator.'
                }
            });
        }

        // Organization status check (Super Admin bypasses tenant org check)
        if (user.role !== ROLES.SUPER_ADMIN && user.organizationId) {
            const org = await findOrgByCustomId(user.organizationId);
            if (!org || org.status === ORG_STATUSES.SUSPENDED || org.status === ORG_STATUSES.DELETED) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: ERROR_CODES.ORGANIZATION_SUSPENDED,
                        message: 'Your organization has been suspended.'
                    }
                });
            }
            req.organization = org;
        }

        req.user = user;
        req.organizationId = user.organizationId;
        next();
    } catch (err) {
        return res.status(403).json({
            success: false,
            error: {
                code: ERROR_CODES.FORBIDDEN,
                message: 'Invalid or expired authentication token'
            }
        });
    }
}
