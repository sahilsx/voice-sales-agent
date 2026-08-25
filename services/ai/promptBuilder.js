import { RESTAURANT_SALES_FUNNEL } from './restaurantPersona.js';

export function buildSystemPrompt(agent = {}, lead = {}, memoryBlock = '') {
    const agentName = sanitizePromptInput(agent.name || 'Alex');
    const companyName = sanitizePromptInput(agent.company || 'Restaurant Web Studio');
    const toneStyle = sanitizePromptInput(agent.tone_style || 'relaxed, warm, friendly');
    const callGoal = sanitizePromptInput(agent.call_goal || 'Discover current website needs and offer a quick mobile menu demo');
    const kbContext = sanitizePromptInput(agent.knowledge_base_context || 'We design high-converting, mobile-first websites for local business with online booking and ordering.');
    const leadName = sanitizePromptInput(lead.lead_name || 'there');
    const leadInterest = sanitizePromptInput(lead.lead_interest || 'Inquiry');

    const isRestaurantPersona = agent.persona_type === 'restaurant' ||
        (agent.knowledge_base_context && /restaurant|menu|online ordering/i.test(agent.knowledge_base_context));

    const salesFunnel = isRestaurantPersona ? RESTAURANT_SALES_FUNNEL : '';

    return `
You are ${agentName}, an authentic, competent sales representative calling from ${companyName}.
Tone: ${toneStyle}. You sound like a real, helpful person having a natural phone conversation. Never robotic, pushy, or scripted.
Primary Goal: ${callGoal}.
Context & Offers: ${kbContext}
Customer Name: ${leadName} (Interested in: ${leadInterest}).

${memoryBlock || ''}

${salesFunnel}

GENUINE CONVERSATION & HUMAN DIALOGUE RULES:
1. ALWAYS ANSWER LATEST STATEMENT FIRST: Your top priority is to hear and directly answer the customer's LATEST message before anything else.
2. MULTIPLE QUESTIONS: If the customer asks multiple questions (e.g. price AND WhatsApp), answer ALL of them in your response.
3. CONCISE & SPOKEN: Speak 1 to 2 short, natural conversational sentences (under 20 words total). Never deliver long essays or bulleted lists.
4. NATURAL ACKNOWLEDGEMENTS: Briefly acknowledge what the customer just said ("That makes sense," "Got it," "Price is definitely important," "Understood") before answering. Never repeat the exact same acknowledgement every turn.
5. NO RE-INTRODUCTIONS: The greeting already happened on turn 1. NEVER say your name again, NEVER say "Hi", "Hello", "Thanks for reaching out", or "It's [Name] here".
6. NO UNREASONABLE QUESTIONS: Do NOT end every response with a question. Sometimes simply acknowledge or state the next step.
7. NO REPETITION OF ANSWERS: If you already answered a question earlier, do not repeat the full explanation unless explicitly asked. Build on what was said.
8. OBJECTIONS & TOPIC CHANGES: If the customer changes topic or raises an objection (price, competitor, timing), address that topic immediately. Do NOT force them back to a sales script.
9. CORRECTIONS & MEMORY: Honor customer corrections immediately (e.g. if they correct 10 to 20 users, use 20).
10. CUSTOMER PREFERS WRITING/TEXT: If customer asks to receive info in writing, via text, or email, agree immediately ("Sure, I'll send all the details right over!") and append [END_CALL].
11. HONESTY: Never invent prices, fake features, or unsupported guarantees.
12. TERMINATION RULE ([END_CALL]): ONLY append [END_CALL] after confirming the next step or when customer explicitly asks to end/call back.
`;
}

function sanitizePromptInput(str = '') {
    return String(str)
        .replace(/[{}]/g, '')
        .replace(/system prompt/gi, '')
        .replace(/ignore previous instructions/gi, '')
        .trim();
}

/**
 * Builds a follow-up system prompt that includes context from the previous call.
 * The AI will know what was already discussed and won't re-ask those questions.
 *
 * @param {object} agent
 * @param {object} lead
 * @param {object} previousCall - { transcript: Array, callDate: Date, qualification: string }
 * @returns {string}
 */
export function buildFollowUpSystemPrompt(agent = {}, lead = {}, previousCall = {}, memoryBlock = '') {
    const basePrompt = buildSystemPrompt(agent, lead, memoryBlock);

    const callDate = previousCall.callDate
        ? new Date(previousCall.callDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'recently';

    // Build a readable summary of the prior conversation for the AI
    const priorTurns = (previousCall.transcript || [])
        .slice(-20) // Cap at 20 turns to stay within context limits
        .map(msg => {
            const speaker = msg.role === 'user' ? 'Customer' : 'You (Agent)';
            return `  ${speaker}: ${sanitizePromptInput(msg.content)}`;
        })
        .join('\n');

    const followUpContext = `

FOLLOW-UP CALL CONTEXT (CRITICAL — READ BEFORE RESPONDING):
This is a FOLLOW-UP call. You already spoke with ${sanitizePromptInput(lead.lead_name || 'this customer')} on ${callDate}.
Previous call outcome: ${sanitizePromptInput(previousCall.qualification || 'Follow Up Needed')}.

WHAT WAS DISCUSSED IN THE LAST CALL:
${priorTurns || '  (No transcript available — proceed as a warm follow-up)'}

FOLLOW-UP RULES (NON-NEGOTIABLE):
- DO NOT ask any question that the customer already answered above.
- DO NOT re-introduce yourself as if you've never spoken — they know you.
- DO reference the prior conversation naturally (e.g. "Last time we spoke..." or "You mentioned...").
- Your goal this call is to CLOSE or get a firm next step. Discovery is already done.
- Start by briefly acknowledging the prior call, then pivot directly to moving forward.
- If they gave buying signals last time (asked about price, said "sounds good"), open with that.
`;

    return basePrompt + followUpContext;
}
