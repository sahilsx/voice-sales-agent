import AuditLog from '../models/AuditLog.js';

export async function logAuditEvent({ organizationId, userId, userEmail, action, resource, resourceId, ip, details }) {
    try {
        await AuditLog.create({
            organizationId: organizationId || 'system',
            userId: userId || 'system',
            userEmail: userEmail || 'system',
            action,
            resource,
            resourceId,
            ip,
            details
        });
    } catch (err) {
        console.error('❌ [AuditLog Error]:', err.message);
    }
}
