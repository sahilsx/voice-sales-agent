// services/organizationService.js
import Organization from '../models/Organization.js';

/**
 * Find an organization by the custom string `id` field.
 * This avoids any accidental casting to Mongo ObjectId.
 * @param {string} customId - The custom organization identifier (e.g., 'org_master').
 * @returns {Promise<object|null>} The organization document (lean) or null if not found.
 */
export const findOrgByCustomId = async (customId) => {
    if (!customId) return null;
    let org = await Organization.findOne({ id: customId }).lean();
    if (!org && customId === 'org_master') {
        try {
            org = await Organization.create({
                id: 'org_master',
                name: 'Master Enterprise',
                slug: 'master-enterprise',
                status: 'Active',
                limits: { maxConcurrentCalls: 5, dailyCallCap: 1000 }
            });
            if (org && org.toObject) org = org.toObject();
        } catch (_) {
            org = await Organization.findOne({ id: 'org_master' }).lean();
        }
    }
    return org;
};
