import twilio from 'twilio';
import { env } from '../../config/env.js';

const twilioClient = (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN)
    ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
    : null;

function escapeXml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function buildGatherTwiml({ respondUrl, sayText, audioUrl, goodbyeText }) {
    const sayOrPlay = audioUrl
        ? `<Play>${escapeXml(audioUrl)}</Play>`
        : `<Say voice="Polly.Joanna">${escapeXml(sayText)}</Say>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${escapeXml(respondUrl)}" method="POST" timeout="8" speechTimeout="auto" speechModel="phone_call" hints="Sahil, demo, menu, mobile, website, reservations, Instagram, schedule, yes, no, thanks, bye, 10 AM, 2 PM" language="en-US">
        ${sayOrPlay}
    </Gather>
    <Gather input="speech" action="${escapeXml(respondUrl)}" method="POST" timeout="6" speechTimeout="auto" speechModel="phone_call" language="en-US">
        <Say voice="Polly.Joanna">Are you still there?</Say>
    </Gather>
    <Say voice="Polly.Joanna">${escapeXml(goodbyeText || 'Thank you for your time. Goodbye.')}</Say>
    <Hangup/>
</Response>`;
}

export function buildErrorTwiml(message) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
    <Hangup/>
</Response>`;
}

export function buildGoodbyeTwiml({ sayText, audioUrl }) {
    const sayOrPlay = audioUrl
        ? `<Play>${escapeXml(audioUrl)}</Play>`
        : `<Say voice="Polly.Joanna">${escapeXml(sayText)}</Say>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    ${sayOrPlay}
    <Hangup/>
</Response>`;
}

export function buildMediaStreamTwiml({ streamUrl, callSid, agentId, leadId, orgId }) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${escapeXml(streamUrl)}">
            <Parameter name="callSid" value="${escapeXml(callSid || '')}" />
            <Parameter name="agentId" value="${escapeXml(agentId || '')}" />
            <Parameter name="leadId" value="${escapeXml(leadId || '')}" />
            <Parameter name="orgId" value="${escapeXml(orgId || '')}" />
        </Stream>
    </Connect>
</Response>`;
}

export async function placeOutboundCall({ from, to, url, statusCallback }) {
    if (!twilioClient) {
        throw new Error('Twilio client is not initialized. Please verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
    }

    console.log(`📍 [STEP 1] Twilio Outbound Call Triggered -> To: ${to}`);
    console.log(`   [STEP 1] Twilio Webhook URL: ${url}`);

    const callPayload = {
        from: from || env.TWILIO_PHONE_NUMBER,
        to,
        url,
        statusCallback,
        statusCallbackEvent: ['completed', 'failed', 'no-answer', 'busy', 'canceled']
    };

    if (env.ENABLE_TWILIO_AMD) {
        callPayload.machineDetection = 'Enable';
        callPayload.machineDetectionTimeout = 6;
    }

    try {
        const call = await twilioClient.calls.create(callPayload);
        return call;
    } catch (err) {
        // Fallback for Twilio Trial accounts or parameter restrictions
        if (callPayload.machineDetection && (err.message?.includes('trial accounts') || err.code === 21622)) {
            console.warn('⚠️ [Twilio AMD Warning] Account is a Trial account or AMD parameter is disallowed. Retrying call without AMD...');
            delete callPayload.machineDetection;
            delete callPayload.machineDetectionTimeout;
            return await twilioClient.calls.create(callPayload);
        }
        throw err;
    }
}
