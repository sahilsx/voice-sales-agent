import Lead from '../models/Lead.js';
import Agent from '../models/Agent.js';
import CallLog from '../models/CallLog.js';

/**
 * GET /api/stats
 * Lightweight aggregation endpoint — returns dashboard metric counts without
 * fetching full document collections. All operations use countDocuments or
 * aggregate pipelines so the DB only returns the numbers, not the docs.
 */
export async function getOrgStats(req, res, next) {
    try {
        const orgId = req.organizationId;

        // Run all counts and the cost aggregate in parallel
        const [
            totalLeads,
            totalAgents,
            interestedLeads,
            dncLeads,
            costResult
        ] = await Promise.all([
            Lead.countDocuments({ organizationId: orgId }),
            Agent.countDocuments({ organizationId: orgId }),
            Lead.countDocuments({
                organizationId: orgId,
                $or: [{ qualification: 'Interested' }, { sentiment: 'Interested' }]
            }),
            Lead.countDocuments({ organizationId: orgId, doNotCall: true }),
            CallLog.aggregate([
                { $match: { organizationId: orgId } },
                { $group: { _id: null, totalCost: { $sum: '$cost.total' } } }
            ])
        ]);

        const totalCallCost = costResult.length > 0 ? (costResult[0].totalCost || 0) : 0;

        res.json({
            success: true,
            data: {
                totalLeads,
                totalAgents,
                interestedLeads,
                dncLeads,
                totalCallCost
            }
        });
    } catch (err) {
        next(err);
    }
}
