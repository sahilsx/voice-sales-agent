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
    return await Organization.findOne({ id: customId }).lean();
};
