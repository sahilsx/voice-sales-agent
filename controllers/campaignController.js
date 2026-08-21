import Campaign from '../models/Campaign.js';
import Lead from '../models/Lead.js';
import { findOrgByCustomId } from '../services/organizationService.js';
import { findLeadByIdOrPhone } from '../services/leadService.js';
import { campaignStartSchema } from '../validators/campaignValidator.js';
import { placeOutboundCall } from '../services/telephony/twilioService.js';
import { inMemoryQueue } from '../services/campaignQueue.js';
import { logAuditEvent } from '../services/auditService.js';
import { CAMPAIGN_STATUSES, CALL_STATUSES, QUALIFICATIONS, ERROR_CODES } from '../config/constants.js';
import { env } from '../config/env.js';

export async function triggerSingleLeadCall(req, res, next) {
    try {
        const leadIdParam = req.params.leadId;
        const orgId = req.organizationId || req.user?.organizationId || 'org_master';
        let lead = await findLeadByIdOrPhone(leadIdParam, orgId);

        if (!lead) {
            // Check if any lead exists in the database
            const anyLead = await Lead.findOne({ organizationId: orgId }).sort({ created_at: -1 }).lean()
                || await Lead.findOne().sort({ created_at: -1 }).lean();

            if (anyLead) {
                console.log(`ℹ️ [Campaign Controller] Specified lead '${leadIdParam}' not found. Auto-selecting most recent lead '${anyLead.id}' (${anyLead.lead_name}).`);
                lead = anyLead;
            }
        }

        if (!lead) {
            // Auto-create a demo lead if database has no leads
            const createdDoc = await Lead.create({
                id: `lead_${Date.now()}`,
                organizationId: orgId,
                agent_id: 'agent_default',
                lead_name: 'Customer',
                lead_phone: env.TWILIO_PHONE_NUMBER || '+10000000000',
                lead_interest: 'our services',
                status: CALL_STATUSES.INITIATED,
                qualification: QUALIFICATIONS.UNKNOWN,
                doNotCall: false
            });
            lead = createdDoc.toObject();
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
        const voiceEndpoint = env.USE_PIPECAT_FOR_CALLS ? 'voice-stream' : 'voice';

        if (!publicTunnelUrl || publicTunnelUrl.includes('localhost') || publicTunnelUrl.includes('127.0.0.1')) {
            return res.status(400).json({
                success: false,
                error: {
                    code: ERROR_CODES.VALIDATION_ERROR,
                    message: 'Public Ngrok Security Tunnel is not online. Twilio requires a public URL (https://...). Please check NGROK_AUTHTOKEN in .env'
                }
            });
        }

        const skipNgrokWarning = publicTunnelUrl.includes('ngrok') ? '&ngrok-skip-browser-warning=true' : '';
        const skipNgrokStatusParam = publicTunnelUrl.includes('ngrok') ? '?ngrok-skip-browser-warning=true' : '';

        const call = await placeOutboundCall({
            to: lead.lead_phone,
            url: `${publicTunnelUrl}/${voiceEndpoint}?lead_id=${lead.id}&agent_id=${lead.agent_id}&org_id=${req.organizationId}${skipNgrokWarning}`,
            statusCallback: `${publicTunnelUrl}/status${skipNgrokStatusParam}`
        });

        await Lead.findOneAndUpdate(
            { id: lead.id },
            { status: CALL_STATUSES.CALLING, call_sid: call.sid }
        );

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

        const orgId = req.organizationId || req.user?.organizationId || 'org_master';

        let pendingLeads = await Lead.find({
            organizationId: orgId,
            agent_id: validated.agent_id,
            doNotCall: false,
            qualification: { $ne: QUALIFICATIONS.DO_NOT_CALL }
        }).lean();

        if (!pendingLeads || pendingLeads.length === 0) {
            pendingLeads = await Lead.find({
                agent_id: validated.agent_id,
                doNotCall: false,
                qualification: { $ne: QUALIFICATIONS.DO_NOT_CALL }
            }).lean();
        }

        if (!pendingLeads || pendingLeads.length === 0) {
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
