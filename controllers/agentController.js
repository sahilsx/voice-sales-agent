import Agent from '../models/Agent.js';
import { agentSchema } from '../validators/agentValidator.js';
import { logAuditEvent } from '../services/auditService.js';
import { ERROR_CODES } from '../config/constants.js';

export async function getAgents(req, res, next) {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
        const search = req.query.search ? req.query.search.trim() : '';

        const query = { organizationId: req.organizationId };
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await Agent.countDocuments(query);
        const agents = await Agent.find(query)
            .sort({ created_at: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({
            success: true,
            data: agents,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
}

export async function createOrUpdateAgent(req, res, next) {
    try {
        const validated = agentSchema.parse(req.body);

        let agentId = validated.id;
        let action = 'UPDATE';

        if (!agentId) {
            agentId = `agent_${Date.now()}`;
            action = 'CREATE';
        }

        const agentData = {
            ...validated,
            id: agentId,
            organizationId: req.organizationId
        };

        const agent = await Agent.findOneAndUpdate(
            { id: agentId, organizationId: req.organizationId },
            agentData,
            { upsert: true, new: true }
        ).lean();

        await logAuditEvent({
            organizationId: req.organizationId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: `AGENT_${action}`,
            resource: 'AGENT',
            resourceId: agent.id,
            ip: req.ip,
            details: { name: agent.name, company: agent.company }
        });

        res.json({ success: true, data: agent });
    } catch (err) {
        next(err);
    }
}

export async function deleteAgent(req, res, next) {
    try {
        const agent = await Agent.findOneAndDelete({
            id: req.params.id,
            organizationId: req.organizationId
        });

        if (!agent) {
            return res.status(404).json({
                success: false,
                error: {
                    code: ERROR_CODES.NOT_FOUND,
                    message: 'Agent not found in your organization'
                }
            });
        }

        await logAuditEvent({
            organizationId: req.organizationId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'AGENT_DELETE',
            resource: 'AGENT',
            resourceId: req.params.id,
            ip: req.ip
        });

        res.json({ success: true, data: { message: 'Agent deleted successfully' } });
    } catch (err) {
        next(err);
    }
}
