import mongoose from 'mongoose';
import AgentModel from './models/Agent.js';
import LeadModel from './models/Lead.js';
import CallLogModel from './models/CallLog.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export async function connectDB() {
    if (!MONGODB_URI) {
        console.warn('⚠️  MONGODB_URI missing in .env');
        return;
    }
    if (mongoose.connection.readyState >= 1) return;

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB Atlas Cloud Database!');
        await seedDefaultAgents();
    } catch (err) {
        console.error('❌ MongoDB Atlas connection error:', err.message);
    }
}

// Initial Seed for MongoDB Atlas
async function seedDefaultAgents() {
    const count = await AgentModel.countDocuments();
    if (count === 0) {
        console.log('🌱 Seeding default AI Agents into MongoDB Atlas...');
        await AgentModel.create([
            {
                id: "agent_real_estate",
                name: "Alex",
                company: "Horizon Realty",
                role_title: "Real Estate Sales Specialist",
                tone_style: "relaxed, warm, friendly, and conversational",
                call_goal: "Find out property preferences and offer a quick weekend walkthrough",
                first_message: "Hey {{lead_name}}, it's Alex from Horizon Realty! How's your week going?",
                knowledge_base_context: "Properties: Downtown Heights, 3BHK luxury apartments starting at $450k. Amenities: Underground parking, rooftop pool, 24/7 security. Location: 5 minutes from Central Metro.",
                voice_engine: "elevenlabs",
                voice_id: "JBFqnCBsd6RMkjVDRZzb"
            },
            {
                id: "agent_devpulse",
                name: "Jordan",
                company: "DevPulse AI",
                role_title: "Account Executive",
                tone_style: "casual, tech-savvy, warm, and authentic",
                call_goal: "Have a relaxed chat about their current deployment stack and see if a 10-minute demo makes sense",
                first_message: "Hey {{lead_name}}, it's Jordan from DevPulse! Caught you in the middle of something or got a quick second?",
                knowledge_base_context: "DevPulse AI cuts deployment times by 70%. Connects natively with GitHub, AWS, and Docker with zero-downtime auto-scaling.",
                voice_engine: "elevenlabs",
                voice_id: "JBFqnCBsd6RMkjVDRZzb"
            }
        ]);
        console.log('✓ MongoDB Atlas seeding complete.');
    }
}

// ---------------------------------------------------------------------
// Agent Methods (MongoDB Atlas)
// ---------------------------------------------------------------------
export async function getAgents() {
    await connectDB();
    const agents = await AgentModel.find().lean();
    return agents;
}

export async function getAgentById(id) {
    await connectDB();
    const agent = await AgentModel.findOne({ id }).lean();
    return agent;
}

export async function saveAgent(agentData) {
    await connectDB();
    if (!agentData.id) {
        agentData.id = 'agent_' + Date.now();
    }
    const updated = await AgentModel.findOneAndUpdate(
        { id: agentData.id },
        agentData,
        { upsert: true, new: true }
    ).lean();
    return updated;
}

export async function deleteAgent(id) {
    await connectDB();
    await AgentModel.deleteOne({ id });
}

// ---------------------------------------------------------------------
// Lead Methods (MongoDB Atlas)
// ---------------------------------------------------------------------
export async function getLeads(agentId = null) {
    await connectDB();
    const query = agentId ? { agent_id: agentId } : {};
    const leads = await LeadModel.find(query).sort({ created_at: -1 }).lean();
    return leads;
}

export async function addLeadsBatch(agentId, leadsArray) {
    await connectDB();
    const formatted = leadsArray.map((item, idx) => ({
        id: `lead_${Date.now()}_${idx}`,
        agent_id: agentId,
        lead_name: item.lead_name || item.name || item.Name || 'Lead',
        lead_phone: String(item.lead_phone || item.phone || item.Phone || '').trim(),
        lead_interest: item.lead_interest || item.interest || item.Interest || 'Sales Inquiry',
        status: 'pending',
        call_sid: null
    })).filter(l => l.lead_phone.length > 3);

    const inserted = await LeadModel.insertMany(formatted);
    return inserted;
}

export async function updateLeadStatus(id, status, callSid = null, sentiment = null) {
    await connectDB();
    const update = { status };
    if (callSid) update.call_sid = callSid;
    if (sentiment) update.sentiment = sentiment;

    const filter = id ? { id } : { call_sid: callSid };
    if (!id && !callSid) return null;

    const lead = await LeadModel.findOneAndUpdate(
        filter,
        update,
        { new: true }
    ).lean();
    return lead;
}

export async function deleteLead(id) {
    await connectDB();
    await LeadModel.deleteOne({ id });
}

export async function deleteAllLeads(agentId = null) {
    await connectDB();
    const query = agentId ? { agent_id: agentId } : {};
    await LeadModel.deleteMany(query);
}

// ---------------------------------------------------------------------
// Call Logs Methods (MongoDB Atlas)
// ---------------------------------------------------------------------
export async function getCallLogs() {
    await connectDB();
    const logs = await CallLogModel.find().sort({ created_at: -1 }).lean();
    return logs;
}

export async function saveCallLog(logData) {
    await connectDB();
    const updated = await CallLogModel.findOneAndUpdate(
        { call_sid: logData.call_sid },
        logData,
        { upsert: true, new: true }
    ).lean();
    return updated;
}

export async function deleteCallLog(callSid) {
    await connectDB();
    await CallLogModel.deleteOne({ call_sid: callSid });
}

export async function deleteAllCallLogs() {
    await connectDB();
    await CallLogModel.deleteMany({});
}
