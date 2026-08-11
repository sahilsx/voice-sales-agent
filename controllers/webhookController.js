import Agent from '../models/Agent.js';
import Lead from '../models/Lead.js';
import CallLog from '../models/CallLog.js';
import Campaign from '../models/Campaign.js';
import { buildSystemPrompt } from '../services/ai/promptBuilder.js';
import { queryLLM } from '../services/ai/conversation.js';
import { detectDoNotCall, parseStructuredAiOutput, calculateLeadScore } from '../services/ai/qualification.js';
import { buildGatherTwiml, buildErrorTwiml } from '../services/telephony/twilioService.js';
import { speakWithElevenLabs } from '../services/tts/elevenLabsService.js';
import { CALL_STATUSES, QUALIFICATIONS, COST_RATES, CAMPAIGN_STATUSES } from '../config/constants.js';

const activeSessions = new Map();
const processedEvents = new Set();

export async function handleVoiceConnect(req, res) {
    try {
        const callSid = req.body.CallSid || `CA_${Date.now()}`;
        const leadId = req.query.lead_id;
        const agentId = req.query.agent_id;
        const organizationId = req.query.org_id || 'org_master';

        // Deduplicate initial call connect
        if (processedEvents.has(`voice_${callSid}`)) {
            console.log(`ℹ️ [Twilio Webhook] Duplicate /voice event for CallSid: ${callSid}`);
            return res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
        processedEvents.add(`voice_${callSid}`);
        setTimeout(() => processedEvents.delete(`voice_${callSid}`), 60000);

        let agent = await Agent.findOne({ id: agentId, organizationId }).lean();
        if (!agent) {
            agent = await Agent.findOne({ organizationId }).lean();
        }
        if (!agent) {
            agent = {
                name: 'Alex',
                company: 'Horizon Realty',
                tone_style: 'warm and casual',
                call_goal: 'Connect with lead',
                first_message: 'Hey {{lead_name}}, how is your week going?',
                voice_id: 'JBFqnCBsd6RMkjVDRZzb'
            };
        }

        let lead = await Lead.findOne({ id: leadId, organizationId }).lean();
        if (!lead) {
            lead = { id: leadId, lead_name: 'Customer', lead_interest: 'our services', doNotCall: false };
        }

        console.log(`\n[Call Connected] CallSid: ${callSid} | Agent: ${agent.name} | Lead: ${lead.lead_name}`);

        const systemPrompt = buildSystemPrompt(agent, lead);
        const history = [{ role: 'system', content: systemPrompt }];

        activeSessions.set(callSid, {
            history,
            agent,
            lead,
            organizationId,
            startTime: Date.now(),
            totalTtsChars: 0,
            totalLlmLatency: 0,
            totalTtsLatency: 0
        });

        const initialGreeting = agent.first_message.replace('{{lead_name}}', lead.lead_name);
        history.push({ role: 'assistant', content: initialGreeting });

        const publicTunnelUrl = req.app.get('publicTunnelUrl') || `${req.protocol}://${req.get('host')}`;
        const ttsResult = await speakWithElevenLabs(initialGreeting, publicTunnelUrl, agent.voice_id);

        let audioUrl = null;
        if (ttsResult) {
            audioUrl = ttsResult.audioUrl;
            activeSessions.get(callSid).totalTtsChars += ttsResult.charCount;
            activeSessions.get(callSid).totalTtsLatency += ttsResult.latency;
        }

        const twiml = buildGatherTwiml({
            respondUrl: `${publicTunnelUrl}/respond`,
            sayText: initialGreeting,
            audioUrl,
            goodbyeText: "I didn't hear a response. Thanks for your time! Have a great day."
        });

        await Lead.updateOne({ id: lead.id, organizationId }, { status: CALL_STATUSES.IN_PROGRESS });

        res.type('text/xml').status(200).send(twiml);
    } catch (err) {
        console.error('❌ [ERROR] /voice handler:', err);
        res.type('text/xml').status(200).send(buildErrorTwiml("Sorry, we're having a technical issue. Goodbye."));
    }
}

export async function handleCustomerRespond(req, res) {
    try {
        const callSid = req.body.CallSid || `CA_${Date.now()}`;
        const userSpeech = req.body.SpeechResult;

        console.log(`\n[Customer Spoke] CallSid: ${callSid} -> "${userSpeech}"`);

        const session = activeSessions.get(callSid) || {
            history: [{ role: 'system', content: 'You are a sales representative.' }],
            agent: { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'Alex' },
            lead: { lead_name: 'Customer', id: null },
            organizationId: 'org_master',
            startTime: Date.now(),
            totalTtsChars: 0,
            totalLlmLatency: 0,
            totalTtsLatency: 0
        };

        let aiSpeech = '';
        const llmStart = Date.now();

        if (userSpeech) {
            session.history.push({ role: 'user', content: userSpeech });
            aiSpeech = await queryLLM(session.history);
            session.history.push({ role: 'assistant', content: aiSpeech });
        } else {
            aiSpeech = "I'm sorry, I couldn't hear you clearly. Could you please say that again?";
        }

        const llmLatency = Date.now() - llmStart;
        session.totalLlmLatency += llmLatency;

        // Detect DNC (Do Not Call) opt-out phrases
        const isDnc = detectDoNotCall(session.history);
        if (isDnc) {
            console.log(`🛑 [DNC Opt-Out Detected] CallSid: ${callSid}`);
            if (session.lead && session.lead.id) {
                await Lead.updateOne(
                    { id: session.lead.id, organizationId: session.organizationId },
                    { doNotCall: true, qualification: QUALIFICATIONS.NOT_INTERESTED, leadScore: 0 }
                );
            }
        }

        const publicTunnelUrl = req.app.get('publicTunnelUrl') || `${req.protocol}://${req.get('host')}`;
        const ttsResult = await speakWithElevenLabs(aiSpeech, publicTunnelUrl, session.agent.voice_id);

        let audioUrl = null;
        if (ttsResult) {
            audioUrl = ttsResult.audioUrl;
            session.totalTtsChars += ttsResult.charCount;
            session.totalTtsLatency += ttsResult.latency;
        }

        // Calculate Call Duration and Costs
        const durationSec = Math.round((Date.now() - session.startTime) / 1000);
        const durationMin = Math.max(1, Math.ceil(durationSec / 60));

        const twilioCost = durationMin * COST_RATES.TWILIO_PER_MINUTE;
        const llmCost = COST_RATES.LLM_PER_CALL;
        const ttsCost = session.totalTtsChars * COST_RATES.TTS_PER_CHARACTER;
        const totalCost = parseFloat((twilioCost + llmCost + ttsCost).toFixed(4));

        // Save CallLog state
        await CallLog.findOneAndUpdate(
            { callSid, organizationId: session.organizationId },
            {
                callSid,
                organizationId: session.organizationId,
                agentId: session.agent.id,
                leadId: session.lead.id,
                lead_name: session.lead.lead_name,
                agent_name: session.agent.name,
                duration_seconds: durationSec,
                transcript: session.history,
                doNotCall: isDnc,
                latency: {
                    llm: session.totalLlmLatency,
                    tts: session.totalTtsLatency,
                    total: session.totalLlmLatency + session.totalTtsLatency
                },
                cost: {
                    twilio: parseFloat(twilioCost.toFixed(4)),
                    llm: parseFloat(llmCost.toFixed(4)),
                    tts: parseFloat(ttsCost.toFixed(4)),
                    total: totalCost
                }
            },
            { upsert: true, new: true }
        );

        const twiml = buildGatherTwiml({
            respondUrl: `${publicTunnelUrl}/respond`,
            sayText: aiSpeech,
            audioUrl,
            goodbyeText: 'Thank you for speaking with us today. Have a great day!'
        });

        res.type('text/xml').status(200).send(twiml);
    } catch (err) {
        console.error('❌ [ERROR] /respond handler:', err);
        res.type('text/xml').status(200).send(buildErrorTwiml("Sorry, we're having a technical issue. Goodbye."));
    }
}

export async function handleStatusCallback(req, res) {
    try {
        const callSid = req.body.CallSid;
        const callStatus = req.body.CallStatus; // 'completed', 'no-answer', 'busy', 'failed', 'canceled'
        console.log(`\n[Call Ended Event] CallSid: ${callSid} | Status: ${callStatus}`);

        const session = activeSessions.get(callSid);
        let organizationId = session?.organizationId || 'org_master';

        const isCompleted = callStatus === 'completed';
        const finalCallStatus = isCompleted ? CALL_STATUSES.COMPLETED : CALL_STATUSES.FAILED;

        // Perform final post-call AI qualification analysis if history exists
        let qualification = QUALIFICATIONS.UNKNOWN;
        let leadScore = 0;
        let isDnc = false;

        if (session && session.history && session.history.length > 2) {
            isDnc = detectDoNotCall(session.history);
            if (isDnc) {
                qualification = QUALIFICATIONS.NOT_INTERESTED;
                leadScore = 0;
            } else {
                qualification = QUALIFICATIONS.INTERESTED;
                leadScore = calculateLeadScore({ qualification, decisionMaker: true });
            }

            await Lead.updateOne(
                { call_sid: callSid, organizationId },
                {
                    status: finalCallStatus,
                    qualification,
                    leadScore,
                    doNotCall: isDnc
                }
            );

            await CallLog.updateOne(
                { callSid, organizationId },
                {
                    status: finalCallStatus,
                    qualification,
                    leadScore,
                    doNotCall: isDnc,
                    endedAt: new Date()
                }
            );
        } else {
            await Lead.updateOne(
                { call_sid: callSid, organizationId },
                { status: finalCallStatus }
            );
        }

        // ─── Sync Campaign Counters ───────────────────────────────────────────
        // Find the lead to get the campaign it belongs to (via agentId lookup)
        const updatedLead = await Lead.findOne({ call_sid: callSid, organizationId }).lean();
        if (updatedLead) {
            // Find the active campaign for this agent in this org
            const campaign = await Campaign.findOne({
                organizationId,
                agentId: updatedLead.agent_id,
                status: { $in: ['running', 'queued'] }
            });

            if (campaign) {
                // Decrement calling, increment completed or failed
                const callIncrement = isCompleted ? { $inc: { calling: -1, completed: 1 } } : { $inc: { calling: -1, failed: 1 } };
                await Campaign.updateOne({ _id: campaign._id }, callIncrement);

                // Reload and check if all leads are done (pending=0 AND calling=0)
                const refreshed = await Campaign.findOne({ _id: campaign._id }).lean();
                const totalProcessed = (refreshed.completed || 0) + (refreshed.failed || 0);
                const totalExpected = refreshed.totalLeads || 0;
                const nothingLeft = (refreshed.calling || 0) <= 0 && (refreshed.pending || 0) <= 0;

                if (nothingLeft && totalExpected > 0 && totalProcessed >= totalExpected) {
                    await Campaign.updateOne(
                        { _id: campaign._id },
                        { status: CAMPAIGN_STATUSES.COMPLETED, completedAt: new Date() }
                    );
                    console.log(`✓ Campaign ${campaign.id} marked COMPLETED.`);
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        activeSessions.delete(callSid);
        res.status(200).send('ok');
    } catch (err) {
        console.error('❌ [ERROR] /status handler:', err);
        res.status(200).send('ok');
    }
}

