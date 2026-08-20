import mongoose from 'mongoose';
import { CALL_STATUSES, QUALIFICATIONS } from '../config/constants.js';

const LeadSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    agent_id: { type: String, required: true, index: true },
    lead_name: { type: String, required: true },
    lead_phone: { type: String, required: true, index: true },
    lead_interest: { type: String, default: 'Sales Inquiry' },
    status: { type: String, default: CALL_STATUSES.INITIATED, index: true },
    qualification: { type: String, default: QUALIFICATIONS.UNKNOWN, index: true },
    sentiment: { type: String, default: 'Pending' },
    leadScore: { type: Number, default: 0, min: 0, max: 100 },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    intent: { type: String, default: 'discovery' },
    decisionMaker: { type: Boolean, default: false },
    existingWebsite: { type: Boolean, default: false },
    websiteQuality: { type: String, default: 'unknown' },
    pricingRequested: { type: Boolean, default: false },
    demoRequested: { type: Boolean, default: false },
    callbackRequested: { type: Boolean, default: false },
    humanHandoffRequested: { type: Boolean, default: false },
    doNotCall: { type: Boolean, default: false, index: true },
    call_sid: { type: String, default: null, index: true },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });

LeadSchema.index({ organizationId: 1, agent_id: 1, doNotCall: 1, status: 1 });
LeadSchema.index({ organizationId: 1, lead_phone: 1 });

export default mongoose.models.Lead || mongoose.model('Lead', LeadSchema);
