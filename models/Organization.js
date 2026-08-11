import mongoose from 'mongoose';
import { ORG_STATUSES, ORG_PLANS } from '../config/constants.js';

const OrganizationSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    companyName: { type: String, default: function () { return this.name; } },
    slug: { type: String, required: true, unique: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    status: {
        type: String,
        enum: Object.values(ORG_STATUSES),
        default: ORG_STATUSES.ACTIVE,
        index: true
    },
    plan: {
        type: String,
        enum: Object.values(ORG_PLANS),
        default: ORG_PLANS.ENTERPRISE
    },
    limits: {
        maxUsers: { type: Number, default: 50 },
        maxLeads: { type: Number, default: 100000 },
        maxConcurrentCalls: { type: Number, default: 10 }
    },
    settings: {
        timezone: { type: String, default: 'UTC' },
        defaultCountry: { type: String, default: 'US' },
        recordingEnabled: { type: Boolean, default: true }
    },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });

OrganizationSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Organization || mongoose.model('Organization', OrganizationSchema);
