import mongoose from 'mongoose';
import { CAMPAIGN_STATUSES } from '../config/constants.js';

const CampaignSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    agentId: { type: String, required: true, index: true },
    status: { 
        type: String, 
        enum: Object.values(CAMPAIGN_STATUSES), 
        default: CAMPAIGN_STATUSES.DRAFT,
        index: true 
    },
    totalLeads: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    calling: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    interested: { type: Number, default: 0 },
    notInterested: { type: Number, default: 0 },
    followUp: { type: Number, default: 0 },
    dnc: { type: Number, default: 0 },
    concurrency: { type: Number, default: 5 },
    totalCost: { type: Number, default: 0 },
    costPerInterestedLead: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date }
}, { timestamps: true });

CampaignSchema.index({ organizationId: 1, status: 1 });

export default mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema);
