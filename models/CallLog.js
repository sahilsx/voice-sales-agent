import mongoose from 'mongoose';
import { CALL_STATUSES, QUALIFICATIONS } from '../config/constants.js';

const CallLogSchema = new mongoose.Schema({
    callSid: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    agentId: { type: String, index: true },
    leadId: { type: String, index: true },
    lead_name: { type: String },
    agent_name: { type: String },
    from: { type: String },
    to: { type: String },
    status: { type: String, default: CALL_STATUSES.COMPLETED, index: true },
    startedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date },
    endedAt: { type: Date },
    duration_seconds: { type: Number, default: 0 },
    transcript: { type: Array, default: [] },
    qualification: { type: String, default: QUALIFICATIONS.UNKNOWN, index: true },
    sentiment: { type: String, default: 'Pending' }, // Backward compatibility
    leadScore: { type: Number, default: 0 },
    intent: { type: String, default: 'discovery' },
    callbackRequested: { type: Boolean, default: false },
    humanHandoffRequested: { type: Boolean, default: false },
    doNotCall: { type: Boolean, default: false },
    llmModel: { type: String, default: 'llama-3.1-8b-instant' },
    ttsModel: { type: String, default: 'eleven_multilingual_v2' },
    voiceId: { type: String, default: 'JBFqnCBsd6RMkjVDRZzb' },
    latency: {
        stt: { type: Number, default: 0 },
        llm: { type: Number, default: 0 },
        tts: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
    },
    cost: {
        twilio: { type: Number, default: 0 },
        llm: { type: Number, default: 0 },
        tts: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
    },
    error: { type: String, default: null },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });

CallLogSchema.index({ organizationId: 1, created_at: -1 });

export default mongoose.models.CallLog || mongoose.model('CallLog', CallLogSchema);
