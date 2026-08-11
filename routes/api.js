import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import {
    getAgents,
    saveAgent,
    deleteAgent,
    getLeads,
    addLeadsBatch,
    getCallLogs,
    deleteLead,
    deleteAllLeads,
    deleteCallLog,
    deleteAllCallLogs
} from '../db.js';

const router = express.Router();

// Setup Multer for Excel file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

function validatePhoneNumber(phone) {
    if (!phone) return false;
    const clean = String(phone).replace(/[\s\-\(\)]/g, '');
    return /^\+?[1-9]\d{7,14}$/.test(clean);
}

// ---------------------------------------------------------------------
// AGENTS API (MongoDB Atlas)
// ---------------------------------------------------------------------
router.get('/agents', async (req, res) => {
    try {
        const agents = await getAgents();
        res.json({ success: true, agents });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/agents', async (req, res) => {
    try {
        const { name, company, role_title, tone_style, call_goal, first_message, knowledge_base_context, voice_id, voice_engine } = req.body;
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Agent name must be at least 2 characters long' });
        }
        if (!company || company.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Company name must be at least 2 characters long' });
        }
        if (!first_message || first_message.trim().length < 10) {
            return res.status(400).json({ success: false, error: 'First message must be at least 10 characters long' });
        }

        const agent = await saveAgent({
            id: req.body.id || null,
            name: name.trim(),
            company: company.trim(),
            role_title: role_title ? role_title.trim() : 'Sales Specialist',
            tone_style: tone_style ? tone_style.trim() : 'relaxed, warm, and human',
            call_goal: call_goal ? call_goal.trim() : 'Connect with lead and schedule demo',
            first_message: first_message.trim(),
            knowledge_base_context: knowledge_base_context ? knowledge_base_context.trim() : '',
            voice_engine: voice_engine || 'elevenlabs',
            voice_id: voice_id ? voice_id.trim() : 'JBFqnCBsd6RMkjVDRZzb'
        });

        res.json({ success: true, agent });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/agents/:id', async (req, res) => {
    try {
        await deleteAgent(req.params.id);
        res.json({ success: true, message: 'Agent deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------
// LEADS API & EXCEL / CSV UPLOAD (MongoDB Atlas)
// ---------------------------------------------------------------------
router.get('/leads', async (req, res) => {
    try {
        const agentId = req.query.agent_id;
        const leads = await getLeads(agentId);
        res.json({ success: true, leads });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/leads/upload', upload.single('file'), async (req, res) => {
    try {
        const { agent_id } = req.body;
        if (!agent_id) {
            return res.status(400).json({ success: false, error: 'Please select an assigned agent for these leads' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Please select an Excel (.xlsx) or CSV (.csv) file to upload' });
        }

        const filePath = req.file.path;
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet);

        // Delete temp upload file
        fs.unlinkSync(filePath);

        if (!rows || rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Uploaded sheet is empty or contains no rows' });
        }

        // Validate lead rows
        const validRows = rows.filter(r => {
            const phone = r.lead_phone || r.phone || r.Phone;
            return validatePhoneNumber(phone);
        });

        if (validRows.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid phone numbers found in file. Phone numbers must include country code (e.g. +917780922090 or +17372508034)'
            });
        }

        const savedLeads = await addLeadsBatch(agent_id, validRows);
        res.json({
            success: true,
            message: `Successfully imported ${savedLeads.length} valid leads to MongoDB Atlas! (${rows.length - validRows.length} invalid rows skipped)`,
            leads_count: savedLeads.length,
            leads: savedLeads
        });
    } catch (err) {
        console.error('[Excel Upload Error]', err);
        res.status(500).json({ success: false, error: 'Failed to parse file: ' + err.message });
    }
});

// Manual single lead add
router.post('/leads/manual', async (req, res) => {
    try {
        const { agent_id, lead_name, lead_phone, lead_interest } = req.body;
        if (!agent_id) {
            return res.status(400).json({ success: false, error: 'Agent assignment is required' });
        }
        if (!lead_name || lead_name.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Customer name must be at least 2 characters long' });
        }
        if (!validatePhoneNumber(lead_phone)) {
            return res.status(400).json({ success: false, error: 'Invalid phone number! Must include country code (e.g. +917780922090 or +17372508034)' });
        }

        const newLeads = await addLeadsBatch(agent_id, [{
            lead_name: lead_name.trim(),
            lead_phone: String(lead_phone).trim(),
            lead_interest: lead_interest ? lead_interest.trim() : 'Sales Inquiry'
        }]);
        res.json({ success: true, lead: newLeads[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/leads/:id', async (req, res) => {
    try {
        await deleteLead(req.params.id);
        res.json({ success: true, message: 'Lead deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/leads', async (req, res) => {
    try {
        const agentId = req.query.agent_id;
        await deleteAllLeads(agentId);
        res.json({ success: true, message: 'Leads cleared' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------
// CALL LOGS & TRANSCRIPTS API (MongoDB Atlas)
// ---------------------------------------------------------------------
router.get('/logs', async (req, res) => {
    try {
        const logs = await getCallLogs();
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/logs/:callSid', async (req, res) => {
    try {
        await deleteCallLog(req.params.callSid);
        res.json({ success: true, message: 'Call log deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/logs', async (req, res) => {
    try {
        await deleteAllCallLogs();
        res.json({ success: true, message: 'All call logs cleared' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
