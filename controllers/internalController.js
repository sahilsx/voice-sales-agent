import Agent from '../models/Agent.js';
import Lead from '../models/Lead.js';
import CallLog from '../models/CallLog.js';
import Campaign from '../models/Campaign.js';
import { buildSystemPrompt, buildFollowUpSystemPrompt } from '../services/ai/promptBuilder.js';
import { analyzeCallQualification } from '../services/ai/qualification.js';
import { CALL_STATUSES, QUALIFICATIONS, COST_RATES, CAMPAIGN_STATUSES } from '../config/constants.js';
import { getPreviousCallTranscript } from '../services/leadService.js';
import { env } from '../config/env.js';

export async function getRuntimeConfig(req, res, next) {
    try {
        const callSid = req.query.call_sid || `CA_${Date.now()}`;
        const leadId = req.query.lead_id;
        const agentId = req.query.agent_id;
        const organizationId = req.query.org_id || 'org_master';

        let agent = await Agent.findOne({ id: agentId, organizationId }).lean();
        if (!agent) {
            agent = await Agent.findOne({ organizationId }).lean();
        }
        if (!agent) {
            agent = {
                id: 'agent_default',
                name: 'Alex',
                company: 'Horizon Realty',
                role_title: 'Sales Specialist',
                tone_style: 'warm and casual',
                call_goal: 'Connect with lead and discover investment needs',
                first_message: 'Hey {{lead_name}}, how is your week going?',
                voice_id: env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'
            };
        }

        let lead = await Lead.findOne({ id: leadId, organizationId }).lean();
        if (!lead) {
            lead = await Lead.findOne({ id: leadId }).lean();
        }
        if (!lead) {
            lead = { id: leadId || 'lead_customer', lead_name: 'Customer', lead_interest: 'our services', qualification: QUALIFICATIONS.UNKNOWN, doNotCall: false };
        }

        const isFollowUp = lead.qualification === QUALIFICATIONS.FOLLOW_UP;

        let previousCall = null;
        if (isFollowUp && lead.id) {
            previousCall = await getPreviousCallTranscript(lead.id, organizationId);
            if (!previousCall && lead.organizationId) {
                previousCall = await getPreviousCallTranscript(lead.id, lead.organizationId);
            }
        }

        const systemPrompt = (isFollowUp && previousCall)
            ? buildFollowUpSystemPrompt(agent, lead, previousCall)
            : buildSystemPrompt(agent, lead);

        let initialGreeting;
        if (isFollowUp && previousCall) {
            const followUpMsg = agent.follow_up_message || `Hey {{lead_name}}, it's ${agent.name || 'me'} again. Just following up from our last chat.`;
            initialGreeting = followUpMsg.replace('{{lead_name}}', lead.lead_name);
        } else {
            initialGreeting = (agent.first_message || 'Hello {{lead_name}}!').replace('{{lead_name}}', lead.lead_name);
        }

        const priorTurns = (isFollowUp && previousCall && previousCall.transcript.length > 0)
            ? previousCall.transcript.slice(-20)
            : [];

        if (lead && lead.id) {
            await Lead.updateOne(
                { id: lead.id, organizationId },
                { status: CALL_STATUSES.IN_PROGRESS, call_sid: callSid }
            );
        }

        await CallLog.findOneAndUpdate(
            { callSid, organizationId },
            {
                callSid,
                organizationId,
                agentId: agent.id,
                leadId: lead.id,
                lead_name: lead.lead_name,
                agent_name: agent.name,
                status: CALL_STATUSES.IN_PROGRESS,
                startedAt: new Date(),
                transcript: [{ role: 'assistant', content: initialGreeting }]
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.json({
            success: true,
            data: {
                callSid,
                organizationId,
                agent: {
                    id: agent.id,
                    name: agent.name,
                    company: agent.company,
                    role_title: agent.role_title,
                    voice_id: agent.voice_id || env.ELEVENLABS_VOICE_ID,
                    voice_engine: agent.voice_engine || 'elevenlabs'
                },
                lead: {
                    id: lead.id,
                    lead_name: lead.lead_name,
                    lead_interest: lead.lead_interest,
                    qualification: lead.qualification
                },
                systemPrompt,
                initialGreeting,
                priorTurns,
                providers: {
                    stt: {
                        provider: 'deepgram',
                        model: 'nova-2-general',
                        language: 'en'
                    },
                    llm: {
                        primary: 'groq',
                        primaryModel: 'llama-3.1-8b-instant',
                        fallback: 'ollama',
                        fallbackUrl: env.OLLAMA_URL,
                        fallbackModel: 'llama3.2'
                    },
                    tts: {
                        primary: 'elevenlabs',
                        model: 'eleven_turbo_v2_5',
                        voiceId: agent.voice_id || env.ELEVENLABS_VOICE_ID,
                        fallback: 'polly',
                        fallbackVoice: 'Joanna'
                    }
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

export async function handleCallComplete(req, res, next) {
    try {
        const {
            callSid,
            organizationId = 'org_master',
            agentId,
            leadId,
            transcript = [],
            duration_seconds = 0,
            latency = {},
            cost = {},
            callStatus = 'completed'
        } = req.body;

        console.log(`\n[Pipecat Internal Callback] CallSid: ${callSid} | Duration: ${duration_seconds}s | Status: ${callStatus}`);

        const isCompleted = callStatus === 'completed';
        const finalCallStatus = isCompleted ? CALL_STATUSES.COMPLETED : CALL_STATUSES.FAILED;

        let qualification = QUALIFICATIONS.UNKNOWN;
        let leadScore = 0;
        let isDnc = false;

        if (transcript && transcript.length > 1) {
            const analysis = analyzeCallQualification(transcript);
            qualification = analysis.qualification;
            leadScore = analysis.leadScore;
            isDnc = analysis.isDnc;
        }

        const leadFilter = leadId
            ? { id: leadId, organizationId }
            : { call_sid: callSid, organizationId };

        await Lead.updateOne(
            leadFilter,
            {
                status: finalCallStatus,
                qualification,
                leadScore,
                doNotCall: isDnc
            }
        );

        await CallLog.findOneAndUpdate(
            { callSid, organizationId },
            {
                callSid,
                organizationId,
                agentId,
                leadId,
                status: finalCallStatus,
                qualification,
                leadScore,
                doNotCall: isDnc,
                duration_seconds,
                transcript,
                latency: {
                    stt: latency.stt || 0,
                    llm: latency.llm || 0,
                    tts: latency.tts || 0,
                    total: latency.total || 0
                },
                cost: {
                    twilio: cost.twilio || 0,
                    llm: cost.llm || 0,
                    tts: cost.tts || 0,
                    total: cost.total || 0
                },
                endedAt: new Date()
            },
            { upsert: true, returnDocument: 'after' }
        );

        const updatedLead = await Lead.findOne({ call_sid: callSid, organizationId }).lean();
        if (updatedLead) {
            const campaign = await Campaign.findOne({
                organizationId,
                agentId: updatedLead.agent_id,
                status: { $in: [CAMPAIGN_STATUSES.RUNNING, CAMPAIGN_STATUSES.QUEUED, CAMPAIGN_STATUSES.COMPLETED] }
            }).sort({ createdAt: -1 });

            if (campaign) {
                const counterUpdate = { $inc: { calling: -1 } };
                if (isCompleted) {
                    counterUpdate.$inc.completed = 1;
                } else {
                    counterUpdate.$inc.failed = 1;
                }
                if (isDnc) {
                    counterUpdate.$inc.dnc = 1;
                } else if (qualification === QUALIFICATIONS.INTERESTED) {
                    counterUpdate.$inc.interested = 1;
                }

                await Campaign.updateOne({ _id: campaign._id }, counterUpdate);
            }
        }

        res.json({ success: true, message: 'Call lifecycle completed and synced.' });
    } catch (err) {
        next(err);
    }
}
