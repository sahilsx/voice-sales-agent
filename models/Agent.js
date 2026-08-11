import mongoose from 'mongoose';

const AgentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    company: { type: String, required: true },
    role_title: { type: String, default: 'Sales Specialist' },
    tone_style: { type: String, default: 'relaxed, warm, friendly' },
    call_goal: { type: String },
    first_message: { type: String, required: true },
    knowledge_base_context: { type: String },
    voice_engine: { type: String, default: 'elevenlabs' },
    voice_id: { type: String, default: 'JBFqnCBsd6RMkjVDRZzb' },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });

AgentSchema.index({ organizationId: 1, id: 1 });

export default mongoose.models.Agent || mongoose.model('Agent', AgentSchema);
