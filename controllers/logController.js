import CallLog from '../models/CallLog.js';
import { ERROR_CODES } from '../config/constants.js';

export async function getLogs(req, res, next) {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

        const query = { organizationId: req.organizationId };
        if (req.query.lead_id) query.leadId = req.query.lead_id;
        if (req.query.agent_id) query.agentId = req.query.agent_id;

        const total = await CallLog.countDocuments(query);
        const logs = await CallLog.find(query)
            .sort({ created_at: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({
            success: true,
            data: logs,
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

export async function deleteLog(req, res, next) {
    try {
        const log = await CallLog.findOneAndDelete({
            callSid: req.params.callSid,
            organizationId: req.organizationId
        });

        if (!log) {
            return res.status(404).json({
                success: false,
                error: {
                    code: ERROR_CODES.NOT_FOUND,
                    message: 'Call transcript log not found'
                }
            });
        }

        res.json({ success: true, data: { message: 'Call transcript log deleted' } });
    } catch (err) {
        next(err);
    }
}

export async function deleteAllLogs(req, res, next) {
    try {
        const result = await CallLog.deleteMany({ organizationId: req.organizationId });
        res.json({ success: true, data: { message: `Cleared ${result.deletedCount} call transcript logs` } });
    } catch (err) {
        next(err);
    }
}
