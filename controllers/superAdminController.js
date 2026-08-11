import Organization from '../models/Organization.js';
import User from '../models/User.js';
import Agent from '../models/Agent.js';
import Lead from '../models/Lead.js';
import Campaign from '../models/Campaign.js';
import CallLog from '../models/CallLog.js';
import AuditLog from '../models/AuditLog.js';
import { ROLES, ORG_STATUSES, USER_STATUSES, ERROR_CODES } from '../config/constants.js';
import { logAuditEvent } from '../services/auditService.js';
import { findOrgByCustomId } from '../services/organizationService.js';

// GET /api/super-admin/stats
export async function getPlatformStats(req, res, next) {
    try {
        const totalOrgs = await Organization.countDocuments({ status: { $ne: ORG_STATUSES.DELETED } });
        const activeOrgs = await Organization.countDocuments({ status: ORG_STATUSES.ACTIVE });
        const suspendedOrgs = await Organization.countDocuments({ status: ORG_STATUSES.SUSPENDED });

        const totalUsers = await User.countDocuments({ status: { $ne: USER_STATUSES.DELETED } });
        const totalAgents = await Agent.countDocuments();
        const totalLeads = await Lead.countDocuments();
        const activeCampaigns = await Campaign.countDocuments({ status: 'running' });

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const callsToday = await CallLog.countDocuments({ created_at: { $gte: todayStart } });
        const callsThisMonth = await CallLog.countDocuments({ created_at: { $gte: monthStart } });

        const interestedLeads = await Lead.countDocuments({ qualification: 'Interested' });
        const followUpLeads = await Lead.countDocuments({ qualification: 'Follow Up Needed' });
        const dncLeads = await Lead.countDocuments({ doNotCall: true });

        const logs = await CallLog.find({}).select('cost').lean();
        const totalPlatformCost = logs.reduce((sum, log) => sum + (log.cost?.total || 0), 0);

        res.json({
            success: true,
            data: {
                totalOrgs,
                activeOrgs,
                suspendedOrgs,
                totalUsers,
                totalAgents,
                totalLeads,
                activeCampaigns,
                callsToday,
                callsThisMonth,
                interestedLeads,
                followUpLeads,
                dncLeads,
                totalPlatformCost: parseFloat(totalPlatformCost.toFixed(2))
            }
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/super-admin/organizations
export async function getOrganizations(req, res, next) {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status ? req.query.status.trim() : '';
        const plan = req.query.plan ? req.query.plan.trim() : '';

        const query = { status: { $ne: ORG_STATUSES.DELETED } };
        if (status) query.status = status;
        if (plan) query.plan = plan;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { companyName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await Organization.countDocuments(query);
        const orgs = await Organization.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Populate computed stats per org
        const enrichedOrgs = await Promise.all(orgs.map(async (org) => {
            const usersCount = await User.countDocuments({ organizationId: org.id, status: { $ne: USER_STATUSES.DELETED } });
            const agentsCount = await Agent.countDocuments({ organizationId: org.id });
            const leadsCount = await Lead.countDocuments({ organizationId: org.id });
            const adminUser = await User.findOne({ organizationId: org.id, role: ROLES.ADMIN, status: { $ne: USER_STATUSES.DELETED } }).select('name email').lean();

            return {
                ...org,
                usersCount,
                agentsCount,
                leadsCount,
                adminName: adminUser ? adminUser.name : 'Unassigned',
                adminEmail: adminUser ? adminUser.email : org.email
            };
        }));

        res.json({
            success: true,
            data: enrichedOrgs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/super-admin/organizations
export async function createOrganization(req, res, next) {
    try {
        const { name, companyName, email, phone, plan, limits, settings, initialAdmin } = req.body;

        if (!name || name.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Organization name must be at least 2 characters' }
            });
        }

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        const existing = await Organization.findOne({ $or: [{ slug }, { id: `org_${slug}` }] });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: ERROR_CODES.DUPLICATE_RESOURCE, message: 'An organization with this name already exists' }
            });
        }

        const orgId = `org_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        const org = await Organization.create({
            id: orgId,
            name: name.trim(),
            companyName: (companyName || name).trim(),
            slug,
            email: email ? email.trim().toLowerCase() : '',
            phone: phone ? phone.trim() : '',
            plan: plan || 'enterprise',
            limits: {
                maxUsers: limits?.maxUsers || 50,
                maxLeads: limits?.maxLeads || 100000,
                maxConcurrentCalls: limits?.maxConcurrentCalls || 10
            },
            settings: {
                timezone: settings?.timezone || 'UTC',
                defaultCountry: settings?.defaultCountry || 'US',
                recordingEnabled: settings?.recordingEnabled !== false
            }
        });

        let adminUser = null;
        if (initialAdmin && initialAdmin.email && initialAdmin.password) {
            const existingEmail = await User.findOne({ email: initialAdmin.email.trim().toLowerCase() });
            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    error: { code: ERROR_CODES.DUPLICATE_RESOURCE, message: 'Initial Admin email already exists in system' }
                });
            }

            const passwordHash = await User.hashPassword(initialAdmin.password);
            adminUser = await User.create({
                id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                organizationId: org.id,
                name: (initialAdmin.name || 'Organization Admin').trim(),
                email: initialAdmin.email.trim().toLowerCase(),
                passwordHash,
                role: ROLES.ADMIN,
                status: USER_STATUSES.ACTIVE
            });
        }

        await logAuditEvent({
            organizationId: 'platform',
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'ORGANIZATION_CREATE',
            resource: 'ORGANIZATION',
            resourceId: org.id,
            ip: req.ip,
            details: { name: org.name, plan: org.plan }
        });

        res.json({
            success: true,
            data: {
                organization: org,
                initialAdmin: adminUser ? { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: adminUser.role } : null
            }
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/super-admin/organizations/:id
export async function getOrganizationById(req, res, next) {
    try {
        const org = await findOrgByCustomId(req.params.id);
        if (!org) {
            return res.status(404).json({ success: false, error: { code: ERROR_CODES.NOT_FOUND, message: 'Organization not found' } });
        }
        if (!org) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'Organization not found' }
            });
        }

        const users = await User.find({ organizationId: org.id, status: { $ne: USER_STATUSES.DELETED } }).select('-passwordHash').lean();
        const agents = await Agent.find({ organizationId: org.id }).lean();
        const leadsCount = await Lead.countDocuments({ organizationId: org.id });
        const callsCount = await CallLog.countDocuments({ organizationId: org.id });
        const interestedLeads = await Lead.countDocuments({ organizationId: org.id, qualification: 'Interested' });
        const followUps = await Lead.countDocuments({ organizationId: org.id, qualification: 'Follow Up Needed' });
        const dncLeads = await Lead.countDocuments({ organizationId: org.id, doNotCall: true });

        const logs = await CallLog.find({ organizationId: org.id }).select('cost').lean();
        const totalCost = logs.reduce((sum, l) => sum + (l.cost?.total || 0), 0);

        res.json({
            success: true,
            data: {
                organization: org,
                users,
                agents,
                stats: {
                    usersCount: users.length,
                    agentsCount: agents.length,
                    leadsCount,
                    callsCount,
                    interestedLeads,
                    followUps,
                    dncLeads,
                    totalCost: parseFloat(totalCost.toFixed(2))
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

// PUT /api/super-admin/organizations/:id
export async function updateOrganization(req, res, next) {
    try {
        const { name, companyName, email, phone, plan, status, limits, settings } = req.body;

        const updateData = {};
        if (name) updateData.name = name.trim();
        if (companyName) updateData.companyName = companyName.trim();
        if (email) updateData.email = email.trim().toLowerCase();
        if (phone) updateData.phone = phone.trim();
        if (plan) updateData.plan = plan;
        if (status) updateData.status = status;
        if (limits) updateData.limits = limits;
        if (settings) updateData.settings = settings;

        const org = await Organization.findOneAndUpdate(
            { id: req.params.id, status: { $ne: ORG_STATUSES.DELETED } },
            updateData,
            { new: true }
        ).lean();

        if (!org) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'Organization not found' }
            });
        }

        await logAuditEvent({
            organizationId: org.id,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'ORGANIZATION_UPDATE',
            resource: 'ORGANIZATION',
            resourceId: org.id,
            ip: req.ip
        });

        res.json({ success: true, data: org });
    } catch (err) {
        next(err);
    }
}

// POST /api/super-admin/organizations/:id/suspend
export async function suspendOrganization(req, res, next) {
    try {
        const org = await Organization.findOneAndUpdate(
            { id: req.params.id, status: { $ne: ORG_STATUSES.DELETED } },
            { status: ORG_STATUSES.SUSPENDED },
            { new: true }
        ).lean();

        if (!org) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'Organization not found' }
            });
        }

        await logAuditEvent({
            organizationId: org.id,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'ORGANIZATION_SUSPEND',
            resource: 'ORGANIZATION',
            resourceId: org.id,
            ip: req.ip
        });

        res.json({ success: true, data: org });
    } catch (err) {
        next(err);
    }
}

// POST /api/super-admin/organizations/:id/activate
export async function activateOrganization(req, res, next) {
    try {
        const org = await Organization.findOneAndUpdate(
            { id: req.params.id, status: { $ne: ORG_STATUSES.DELETED } },
            { status: ORG_STATUSES.ACTIVE },
            { new: true }
        ).lean();

        if (!org) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'Organization not found' }
            });
        }

        await logAuditEvent({
            organizationId: org.id,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'ORGANIZATION_ACTIVATE',
            resource: 'ORGANIZATION',
            resourceId: org.id,
            ip: req.ip
        });

        res.json({ success: true, data: org });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/super-admin/organizations/:id (Soft Delete)
export async function deleteOrganization(req, res, next) {
    try {
        const org = await Organization.findOneAndUpdate(
            { id: req.params.id, status: { $ne: ORG_STATUSES.DELETED } },
            { status: ORG_STATUSES.DELETED, deletedAt: new Date() },
            { new: true }
        ).lean();

        if (!org) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'Organization not found' }
            });
        }

        await logAuditEvent({
            organizationId: org.id,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'ORGANIZATION_DELETE',
            resource: 'ORGANIZATION',
            resourceId: org.id,
            ip: req.ip
        });

        res.json({ success: true, data: { message: 'Organization soft deleted successfully' } });
    } catch (err) {
        next(err);
    }
}

// GET /api/super-admin/users
export async function getAllUsersPlatform(req, res, next) {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
        const search = req.query.search ? req.query.search.trim() : '';
        const organizationId = req.query.organizationId ? req.query.organizationId.trim() : '';
        const role = req.query.role ? req.query.role.trim() : '';
        const status = req.query.status ? req.query.status.trim() : '';

        const query = { status: { $ne: USER_STATUSES.DELETED } };
        if (organizationId) query.organizationId = organizationId;
        if (role) query.role = role;
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .select('-passwordHash')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const orgs = await Organization.find({ status: { $ne: ORG_STATUSES.DELETED } }).select('id name').lean();
        const orgMap = new Map(orgs.map(o => [o.id, o.name]));

        const enrichedUsers = users.map(u => ({
            ...u,
            organizationName: u.organizationId ? (orgMap.get(u.organizationId) || u.organizationId) : 'Platform Super Admin'
        }));

        res.json({
            success: true,
            data: enrichedUsers,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/super-admin/users
export async function createUserPlatform(req, res, next) {
    try {
        const { name, email, password, organizationId, role, status } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Name, email, and password are required' }
            });
        }

        if (role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
            return res.status(403).json({
                success: false,
                error: { code: ERROR_CODES.FORBIDDEN, message: 'Only Super Admins can create another Super Admin.' }
            });
        }

        const existing = await User.findOne({ email: email.trim().toLowerCase() });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: ERROR_CODES.DUPLICATE_RESOURCE, message: 'A user with this email already exists' }
            });
        }

        // Check maxUsers limit if assigned to an organization
        if (organizationId) {
            const org = await findOrgByCustomId(organizationId);
            if (org) {
                const currentUsersCount = await User.countDocuments({ organizationId, status: { $ne: USER_STATUSES.DELETED } });
                const maxUsers = org.limits?.maxUsers || 50;
                if (currentUsersCount >= maxUsers) {
                    return res.status(400).json({
                        success: false,
                        error: { code: ERROR_CODES.USER_LIMIT_REACHED, message: `This organization has reached its maximum limit of ${maxUsers} users.` }
                    });
                }
            }
        }

        const passwordHash = await User.hashPassword(password);
        const newUser = await User.create({
            id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            organizationId: organizationId || null,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            passwordHash,
            role: role || ROLES.AGENT,
            status: status || USER_STATUSES.ACTIVE
        });

        await logAuditEvent({
            organizationId: organizationId || 'platform',
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

// POST /api/super-admin/users/:id/suspend
export async function suspendUserPlatform(req, res, next) {
    try {
        const user = await User.findOneAndUpdate(
            { id: req.params.id, status: { $ne: USER_STATUSES.DELETED } },
            { status: USER_STATUSES.SUSPENDED },
            { new: true }
        ).select('-passwordHash').lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'User not found' }
            });
        }

        await logAuditEvent({
            organizationId: user.organizationId || 'platform',
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'USER_SUSPEND',
            resource: 'USER',
            resourceId: user.id,
            ip: req.ip
        });

        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
}

// POST /api/super-admin/users/:id/activate
export async function activateUserPlatform(req, res, next) {
    try {
        const user = await User.findOneAndUpdate(
            { id: req.params.id, status: { $ne: USER_STATUSES.DELETED } },
            { status: USER_STATUSES.ACTIVE },
            { new: true }
        ).select('-passwordHash').lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'User not found' }
            });
        }

        await logAuditEvent({
            organizationId: user.organizationId || 'platform',
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'USER_ACTIVATE',
            resource: 'USER',
            resourceId: user.id,
            ip: req.ip
        });

        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
}

// POST /api/super-admin/users/:id/reset-password
export async function resetPasswordPlatform(req, res, next) {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Password must be at least 6 characters' }
            });
        }

        const user = await User.findOne({ id: req.params.id, status: { $ne: USER_STATUSES.DELETED } });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: ERROR_CODES.NOT_FOUND, message: 'User not found' }
            });
        }

        user.passwordHash = await User.hashPassword(newPassword);
        await user.save();

        await logAuditEvent({
            organizationId: user.organizationId || 'platform',
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'USER_PASSWORD_RESET',
            resource: 'USER',
            resourceId: user.id,
            ip: req.ip
        });

        res.json({ success: true, data: { message: 'Password reset successfully' } });
    } catch (err) {
        next(err);
    }
}

// GET /api/super-admin/audit-logs
export async function getAuditLogsPlatform(req, res, next) {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
        const search = req.query.search ? req.query.search.trim() : '';

        const query = {};
        if (search) {
            query.$or = [
                { userEmail: { $regex: search, $options: 'i' } },
                { action: { $regex: search, $options: 'i' } },
                { resource: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await AuditLog.countDocuments(query);
        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({
            success: true,
            data: logs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        next(err);
    }
}
