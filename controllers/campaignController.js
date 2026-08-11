import Campaign from '../models/Campaign.js';
import Lead from '../models/Lead.js';
import { findOrgByCustomId } from '../services/organizationService.js';
import { campaignStartSchema } from '../validators/campaignValidator.js';
import { placeOutboundCall } from '../services/telephony/twilioService.js';
import { inMemoryQueue } from '../services/campaignQueue.js';
import { logAuditEvent } from '../services/auditService.js';
import { CAMPAIGN_STATUSES, CALL_STATUSES, ERROR_CODES } from '../config/constants.js';

export async function triggerSingleLeadCall(req, res, next) {
    try {
        const { lead_id } = req.body;
        const lead = await Lead.findOne({ id: lead_id, organizationId: req.organizationId });

        if (!lead) {
            return res.status(404).json({
                success: false,
                error: {
                    code: ERROR_CODES.NOT_FOUND,
                    message: 'Lead not found in your organization'
                }
            });
        }

        if (lead.doNotCall) {
            return res.status(400).json({
                success: false,
                error: {
                    code: ERROR_CODES.VALIDATION_ERROR,
                    message: 'Lead is marked as Do Not Call (DNC) and cannot be dialed.'
                }
            });
        }

        const publicTunnelUrl = req.app.get('publicTunnelUrl') || `${req.protocol}://${req.get('host')}`;

        const call = await placeOutboundCall({
            to: lead.lead_phone,
            url: `${publicTunnelUrl}/voice?lead_id=${lead.id}&agent_id=${lead.agent_id}&org_id=${req.organizationId}`,
            statusCallback: `${publicTunnelUrl}/status`
        });

        lead.status = CALL_STATUSES.CALLING;
        lead.call_sid = call.sid;
        await lead.save();

        await logAuditEvent({
            organizationId: req.organizationId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'SINGLE_CALL_TRIGGER',
            resource: 'LEAD',
            resourceId: lead.id,
            details: { callSid: call.sid }
        });

        res.json({ success: true, data: { call_sid: call.sid } });
    } catch (err) {
        next(err);
    }
}

export async function startCampaign(req, res, next) {
    try {
        const validated = campaignStartSchema.parse(req.body);

        if (req.organizationId) {
            const org = await findOrgByCustomId(req.organizationId);
            if (org && org.limits?.maxConcurrentCalls) {
                validated.concurrency = Math.min(validated.concurrency, org.limits.maxConcurrentCalls);
            }
        }

        const pendingLeads = await Lead.find({
            organizationId: req.organizationId,
            agent_id: validated.agent_id,
            doNotCall: false,
            status: CALL_STATUSES.INITIATED
        }).lean();

        if (pendingLeads.length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: ERROR_CODES.VALIDATION_ERROR,
                    message: 'No pending eligible leads found for this AI agent'
                }
            });
        }

        const campaignId = `camp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const campaign = await Campaign.create({
            id: campaignId,
            organizationId: req.organizationId,
            name: validated.name,
            agentId: validated.agent_id,
            status: CAMPAIGN_STATUSES.QUEUED,
            totalLeads: pendingLeads.length,
            pending: pendingLeads.length,
            concurrency: validated.concurrency
        });

        const publicTunnelUrl = req.app.get('publicTunnelUrl') || `${req.protocol}://${req.get('host')}`;

        // Trigger queue processor
        inMemoryQueue.processCampaign(campaignId, publicTunnelUrl, req.organizationId);

        await logAuditEvent({
            organizationId: req.organizationId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'CAMPAIGN_START',
            resource: 'CAMPAIGN',
            resourceId: campaignId,
            details: { leadCount: pendingLeads.length }
        });

        res.json({
            success: true,
            data: {
                message: `Campaign launched! Calling ${pendingLeads.length} leads with concurrency ${validated.concurrency}.`,
                campaign
            }
        });
    } catch (err) {
        next(err);
    }
}

export async function getCampaigns(req, res, next) {
    try {
        const campaigns = await Campaign.find({ organizationId: req.organizationId })
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, data: campaigns });
    } catch (err) {
        next(err);
    }
}
