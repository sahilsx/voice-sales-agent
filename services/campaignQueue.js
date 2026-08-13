import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';
import Lead from '../models/Lead.js';
import Campaign from '../models/Campaign.js';
import { CAMPAIGN_STATUSES, CALL_STATUSES } from '../config/constants.js';
import { placeOutboundCall } from './telephony/twilioService.js';

let campaignQueue = null;
let campaignWorker = null;
let redisConnection = null;

// Initialize BullMQ if Redis is available, otherwise fallback to in-memory worker
try {
    redisConnection = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false
    });

    redisConnection.on('error', () => {
        // Silent catch for dev mode without active local Redis
    });

    campaignQueue = new Queue('voiceAI_campaigns', { connection: redisConnection });
    console.log('✓ BullMQ Campaign Queue initialized with Redis.');
} catch (err) {
    console.warn('⚠️ Redis unavailable. Using built-in concurrency queue worker.');
}

// In-Memory Campaign Queue Fallback Engine
class InMemoryCampaignQueue {
    constructor() {
        this.runningCampaigns = new Map();
    }

    async processCampaign(campaignId, publicTunnelUrl, organizationId) {
        const campaign = await Campaign.findOne({ id: campaignId, organizationId });
        if (!campaign) return;

        campaign.status = CAMPAIGN_STATUSES.RUNNING;
        campaign.startedAt = new Date();
        await campaign.save();

        this.runningCampaigns.set(campaignId, { state: 'RUNNING' });

        const pendingLeads = await Lead.find({
            organizationId,
            agent_id: campaign.agentId,
            doNotCall: false,
            status: CALL_STATUSES.INITIATED
        }).lean();

        campaign.totalLeads = pendingLeads.length;
        campaign.pending = pendingLeads.length;
        await campaign.save();

        const concurrency = campaign.concurrency || 5;

        for (let i = 0; i < pendingLeads.length; i += concurrency) {
            const currentStatus = this.runningCampaigns.get(campaignId);
            if (!currentStatus || currentStatus.state === 'PAUSED' || currentStatus.state === 'CANCELED') {
                break;
            }

            const batch = pendingLeads.slice(i, i + concurrency);
            await Promise.all(batch.map(async (lead) => {
                try {
                    // Double-check DNC and current status before dialing
                    const freshLead = await Lead.findOne({ id: lead.id, organizationId }).lean();
                    if (!freshLead || freshLead.doNotCall || freshLead.status !== CALL_STATUSES.INITIATED) {
                        // Skip and decrement pending so the campaign can still complete
                        await Campaign.updateOne({ id: campaignId }, { $inc: { failed: 1, pending: -1 } });
                        return;
                    }

                    const call = await placeOutboundCall({
                        to: freshLead.lead_phone,
                        url: `${publicTunnelUrl}/voice?lead_id=${freshLead.id}&agent_id=${campaign.agentId}&org_id=${organizationId}`,
                        statusCallback: `${publicTunnelUrl}/status`
                    });

                    await Lead.updateOne(
                        { id: freshLead.id, organizationId },
                        { status: CALL_STATUSES.CALLING, call_sid: call.sid }
                    );

                    await Campaign.updateOne(
                        { id: campaignId },
                        { $inc: { calling: 1, pending: -1 } }
                    );
                } catch (err) {
                    console.error(`❌ [Campaign Lead Call Error] Lead ${lead.id}:`, err.message);
                    await Lead.updateOne(
                        { id: lead.id, organizationId },
                        { status: CALL_STATUSES.FAILED }
                    );
                    await Campaign.updateOne(
                        { id: campaignId },
                        { $inc: { failed: 1, pending: -1 } }
                    );
                }
            }));
        }

        // NOTE: Do NOT mark campaign COMPLETED here.
        // Completion is handled by handleStatusCallback() in webhookController.js
        // once all Twilio status webhooks have fired and calling=0, pending=0.
        // Prematurely marking it COMPLETED here caused the status callback to not
        // find the campaign (filtered by status=running/queued) and skip counter updates.
        this.runningCampaigns.delete(campaignId);
    }

    pause(campaignId) {
        if (this.runningCampaigns.has(campaignId)) {
            this.runningCampaigns.set(campaignId, { state: 'PAUSED' });
        }
    }

    resume(campaignId, publicTunnelUrl, organizationId) {
        this.processCampaign(campaignId, publicTunnelUrl, organizationId);
    }

    stop(campaignId) {
        if (this.runningCampaigns.has(campaignId)) {
            this.runningCampaigns.set(campaignId, { state: 'CANCELED' });
        }
    }
}

export const inMemoryQueue = new InMemoryCampaignQueue();
