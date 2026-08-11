import xlsx from 'xlsx';
import fs from 'fs';
import Lead from '../models/Lead.js';
import { validatePhoneNumber, formatE164 } from '../validators/leadValidator.js';
import { CALL_STATUSES, QUALIFICATIONS } from '../config/constants.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 5000;

export async function parseAndImportLeads({ filePath, agentId, organizationId }) {
    const stats = {
        imported: 0,
        skipped: 0,
        duplicates: 0,
        invalid: 0
    };

    if (!fs.existsSync(filePath)) {
        throw new Error('Uploaded file not found');
    }

    const fileStats = fs.statSync(filePath);
    if (fileStats.size > MAX_FILE_SIZE_BYTES) {
        fs.unlinkSync(filePath);
        throw new Error('File exceeds maximum size limit of 10MB');
    }

    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet);

        // Delete temp upload file after reading
        fs.unlinkSync(filePath);

        if (!rows || rows.length === 0) {
            throw new Error('Uploaded file is empty or contains no rows');
        }

        if (rows.length > MAX_ROWS) {
            throw new Error(`File exceeds maximum limit of ${MAX_ROWS} rows`);
        }

        // Fetch existing leads for duplicate checking in organization
        const existingLeads = await Lead.find({ organizationId }).select('lead_phone').lean();
        const existingPhones = new Set(existingLeads.map(l => l.lead_phone));

        const newLeadDocs = [];

        for (let idx = 0; idx < rows.length; idx++) {
            const r = rows[idx];
            const name = String(r.lead_name || r.name || r.Name || 'Lead').trim();
            const rawPhone = String(r.lead_phone || r.phone || r.Phone || '').trim();
            const interest = String(r.lead_interest || r.interest || r.Interest || 'Restaurant Website Inquiry').trim();

            if (!rawPhone || !validatePhoneNumber(rawPhone)) {
                stats.invalid++;
                stats.skipped++;
                continue;
            }

            const formattedPhone = formatE164(rawPhone);

            if (existingPhones.has(formattedPhone)) {
                stats.duplicates++;
                stats.skipped++;
                continue;
            }

            existingPhones.add(formattedPhone);

            newLeadDocs.push({
                id: `lead_${Date.now()}_${idx}_${Math.random().toString(36).substring(7)}`,
                organizationId,
                agent_id: agentId,
                lead_name: name || 'Customer',
                lead_phone: formattedPhone,
                lead_interest: interest,
                status: CALL_STATUSES.INITIATED,
                qualification: QUALIFICATIONS.UNKNOWN,
                doNotCall: false
            });
        }

        if (newLeadDocs.length > 0) {
            await Lead.insertMany(newLeadDocs);
            stats.imported = newLeadDocs.length;
        }

        return stats;
    } catch (err) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        throw err;
    }
}
