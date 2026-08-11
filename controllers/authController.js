import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { findOrgByCustomId } from '../services/organizationService.js';
import Agent from '../models/Agent.js';
import Lead from '../models/Lead.js';
import CallLog from '../models/CallLog.js';
import Campaign from '../models/Campaign.js';
import { loginSchema } from '../validators/authValidator.js';
import { env } from '../config/env.js';
import { ROLES, ORG_STATUSES, USER_STATUSES, ERROR_CODES } from '../config/constants.js';
import { logAuditEvent } from '../services/auditService.js';

export async function login(req, res, next) {
    try {
        const validated = loginSchema.parse(req.body);
        const user = await User.findOne({ email: validated.email.toLowerCase() });

        if (!user || user.status === USER_STATUSES.DELETED || !(await user.comparePassword(validated.password))) {
            return res.status(401).json({
                success: false,
                error: {
                    code: ERROR_CODES.UNAUTHORIZED,
                    message: 'Invalid email or password'
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

        let org = null;
        if (user.role !== ROLES.SUPER_ADMIN && user.organizationId) {
            // Find organization by custom id only (string identifier)
            org = await findOrgByCustomId(user.organizationId);
            if (!org || org.status === ORG_STATUSES.SUSPENDED || org.status === ORG_STATUSES.DELETED) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: ERROR_CODES.ORGANIZATION_SUSPENDED,
                        message: 'Your organization has been suspended.'
                    }
                });
            }
        }

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { userId: user.id, organizationId: user.organizationId, role: user.role },
            env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        await logAuditEvent({
            organizationId: user.organizationId || 'platform',
            userId: user.id,
            userEmail: user.email,
            action: 'LOGIN',
            resource: 'USER',
            resourceId: user.id,
            ip: req.ip
        });

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    organizationId: user.organizationId,
                    organizationName: org ? org.name : (user.role === ROLES.SUPER_ADMIN ? 'Platform Super Admin' : null)
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

export async function getCurrentUser(req, res) {
    let orgName = null;
    if (req.user.organizationId) {
        const org = await findOrgByCustomId(req.user.organizationId);
        if (org) orgName = org.name;
    } else if (req.user.role === ROLES.SUPER_ADMIN) {
        orgName = 'Platform Super Admin';
    }

    res.json({
        success: true,
        data: {
            user: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
                organizationId: req.user.organizationId,
                organizationName: orgName
            }
        }
    });
}

export async function seedDefaultOrgAndAdmin() {
    try {
        // 1. Seed Platform SUPER_ADMIN
        let superAdmin = await User.findOne({ email: env.SUPER_ADMIN_EMAIL.toLowerCase() });
        if (!superAdmin) {
            const passwordHash = await User.hashPassword(env.SUPER_ADMIN_PASSWORD);
            superAdmin = await User.create({
                id: 'user_super_admin',
                organizationId: null,
                name: 'Platform Super Admin',
                email: env.SUPER_ADMIN_EMAIL.toLowerCase(),
                passwordHash,
                role: ROLES.SUPER_ADMIN
            });
            console.log(`✓ Platform SUPER_ADMIN seeded (${env.SUPER_ADMIN_EMAIL}).`);
        }

        // 2. Seed Default Master Organization
        let org = await Organization.findOne({ slug: 'master-org' });
        if (!org) {
            org = await Organization.create({
                id: 'org_master',
                name: 'VoiceAI Master Enterprise',
                companyName: 'VoiceAI Master Enterprise Inc.',
                slug: 'master-org',
                email: 'admin@voiceai.com',
                phone: '+18005550199',
                status: ORG_STATUSES.ACTIVE,
                plan: 'enterprise'
            });
            console.log('✓ Master Organization created (org_master).');
        }

        // 3. Seed Default Master Org ADMIN
        let admin = await User.findOne({ email: 'admin@voiceai.com' });
        if (!admin) {
            const passwordHash = await User.hashPassword('Admin@123456');
            admin = await User.create({
                id: 'user_admin',
                organizationId: org.id,
                name: 'Master Admin',
                email: 'admin@voiceai.com',
                passwordHash,
                role: ROLES.ADMIN
            });
            console.log('✓ Master Org ADMIN user seeded (admin@voiceai.com / Admin@123456).');
        }

        // Migrate legacy unassigned database records
        const filter = { $or: [{ organizationId: { $exists: false } }, { organizationId: null }, { organizationId: '' }] };
        const agentMigrated = await Agent.updateMany(filter, { organizationId: org.id });
        const leadMigrated = await Lead.updateMany(filter, { organizationId: org.id });
        const logMigrated = await CallLog.updateMany(filter, { organizationId: org.id });
        const campaignMigrated = await Campaign.updateMany(filter, { organizationId: org.id });

        if (agentMigrated.modifiedCount > 0 || leadMigrated.modifiedCount > 0 || logMigrated.modifiedCount > 0) {
            console.log(`✓ Migrated legacy records to Tenant org_master: ${agentMigrated.modifiedCount} agents, ${leadMigrated.modifiedCount} leads, ${logMigrated.modifiedCount} logs.`);
        }
    } catch (err) {
        console.error('❌ Error seeding default org and admin:', err.message);
    }
}
