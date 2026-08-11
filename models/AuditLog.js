import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    userEmail: { type: String },
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: String },
    ip: { type: String },
    details: { type: Object, default: {} },
    timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

AuditLogSchema.index({ organizationId: 1, timestamp: -1 });

export default mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
