import xlsx from 'xlsx';
import Lead from '../models/Lead.js';
import { findOrgByCustomId } from '../services/organizationService.js';
import { manualLeadSchema } from '../validators/leadValidator.js';
import { parseAndImportLeads } from '../services/leadService.js';
import { logAuditEvent } from '../services/auditService.js';
import { ERROR_CODES, CALL_STATUSES, QUALIFICATIONS } from '../config/constants.js';

export async function getLeads(req, res, next) {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
        const agentId = req.query.agent_id;
        const search = req.query.search ? req.query.search.trim() : '';
        const dncOnly = req.query.dnc === 'true';

        const query = { organizationId: req.organizationId };
        if (agentId) query.agent_id = agentId;
        if (dncOnly) query.doNotCall = true;
        if (search) {
            query.$or = [
                { lead_name: { $regex: search, $options: 'i' } },
                { lead_phone: { $regex: search, $options: 'i' } },
                { lead_interest: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await Lead.countDocuments(query);
        const leads = await Lead.find(query)
            .sort({ created_at: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({
            success: true,
            data: leads,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
}

export async function addManualLead(req, res, next) {
    try {
        const validated = manualLeadSchema.parse(req.body);

        if (req.organizationId) {
            const org = await findOrgByCustomId(req.organizationId);
            if (org) {
                const currentLeads = await Lead.countDocuments({ organizationId: req.organizationId });
                const maxLeads = org.limits?.maxLeads || 100000;
                if (currentLeads >= maxLeads) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            code: ERROR_CODES.LEAD_LIMIT_REACHED,
                            message: `Organization lead limit of ${maxLeads} reached.`
                        }
                    });
                }
            }
        }

        const newLead = await Lead.create({
            id: `lead_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            organizationId: req.organizationId,
            agent_id: validated.agent_id,
            lead_name: validated.lead_name,
            lead_phone: validated.lead_phone,
            lead_interest: validated.lead_interest,
            status: CALL_STATUSES.INITIATED,
            qualification: QUALIFICATIONS.UNKNOWN
        });

        await logAuditEvent({
            organizationId: req.organizationId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'LEAD_CREATE_MANUAL',
            resource: 'LEAD',
            resourceId: newLead.id,
            ip: req.ip
        });

        res.json({ success: true, data: newLead });
    } catch (err) {
        next(err);
    }
}

export async function uploadLeadsFile(req, res, next) {
    try {
        const { agent_id } = req.body;
        if (!agent_id) {
            return res.status(400).json({
                success: false,
                error: {
                    code: ERROR_CODES.VALIDATION_ERROR,
                    message: 'Please select an assigned agent for these leads'
                }
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: {
                    code: ERROR_CODES.VALIDATION_ERROR,
                    message: 'Please select an Excel (.xlsx) or CSV (.csv) file to upload'
                }
            });
        }

        if (req.organizationId) {
            const org = await findOrgByCustomId(req.organizationId);
            if (org) {
                const currentLeads = await Lead.countDocuments({ organizationId: req.organizationId });
                const maxLeads = org.limits?.maxLeads || 100000;
                if (currentLeads >= maxLeads) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            code: ERROR_CODES.LEAD_LIMIT_REACHED,
                            message: `Organization lead limit of ${maxLeads} reached.`
                        }
                    });
                }
            }
        }

        const report = await parseAndImportLeads({
            filePath: req.file.path,
            agentId: agent_id,
            organizationId: req.organizationId
        });

        await logAuditEvent({
            organizationId: req.organizationId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'LEAD_BULK_UPLOAD',
            resource: 'LEAD',
            ip: req.ip,
            details: report
        });

        res.json({
            success: true,
            data: {
                message: `Lead upload processed: ${report.imported} imported, ${report.skipped} skipped (${report.duplicates} duplicates, ${report.invalid} invalid)`,
                report
            }
        });
    } catch (err) {
        next(err);
    }
}

export async function toggleDoNotCall(req, res, next) {
    try {
        const { id } = req.params;
        const { doNotCall } = req.body;

        const lead = await Lead.findOneAndUpdate(
            { id, organizationId: req.organizationId },
            { doNotCall: Boolean(doNotCall) },
            { new: true }
        );

        if (!lead) {
            return res.status(404).json({
                success: false,
                error: {
                    code: ERROR_CODES.NOT_FOUND,
                    message: 'Lead not found'
                }
            });
        }

        await logAuditEvent({
            organizationId: req.organizationId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'LEAD_DNC_TOGGLE',
            resource: 'LEAD',
            resourceId: id,
            details: { doNotCall: Boolean(doNotCall) }
        });

        res.json({ success: true, data: lead });
    } catch (err) {
        next(err);
    }
}

export async function deleteLead(req, res, next) {
    try {
        const lead = await Lead.findOneAndDelete({
            id: req.params.id,
            organizationId: req.organizationId
        });

        if (!lead) {
            return res.status(404).json({
                success: false,
                error: {
                    code: ERROR_CODES.NOT_FOUND,
                    message: 'Lead not found in your organization'
                }
            });
        }

        res.json({ success: true, data: { message: 'Lead deleted' } });
    } catch (err) {
        next(err);
    }
}

export async function deleteAllLeads(req, res, next) {
    try {
        const agentId = req.query.agent_id;
        const query = { organizationId: req.organizationId };
        if (agentId) query.agent_id = agentId;

        const result = await Lead.deleteMany(query);

        await logAuditEvent({
            organizationId: req.organizationId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'LEAD_BULK_DELETE',
            resource: 'LEAD',
            details: { deletedCount: result.deletedCount, agentId }
        });

        res.json({ success: true, data: { message: `Cleared ${result.deletedCount} leads` } });
    } catch (err) {
        next(err);
    }
}

export async function downloadLeadTemplate(req, res, next) {
    try {
        const format = (req.query.format || 'xlsx').toLowerCase();

        const sampleData = [
            {
                'lead_name': 'John Doe',
                'lead_phone': '+12345678901',
                'lead_interest': 'Restaurant Website Inquiry'
            },
            {
                'lead_name': 'Sarah Smith',
                'lead_phone': '+19876543210',
                'lead_interest': 'Mobile Menu Demo'
            },
            {
                'lead_name': 'Alex Johnson',
                'lead_phone': '+11223344556',
                'lead_interest': 'Online Ordering System'
            }
        ];

        const worksheet = xlsx.utils.json_to_sheet(sampleData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Leads');

        if (format === 'csv') {
            const csvOutput = xlsx.utils.sheet_to_csv(worksheet);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="leads_sample_template.csv"');
            return res.send(csvOutput);
        } else {
            const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="leads_sample_template.xlsx"');
            return res.send(buffer);
        }
    } catch (err) {
        next(err);
    }
}
