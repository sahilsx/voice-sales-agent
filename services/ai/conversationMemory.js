/**
 * Conversation Memory & Dynamic State Engine
 * Extracts verified facts from customer utterances and tracks conversation state.
 */

export function extractCustomerFacts(history = []) {
    const facts = {
        name: null,
        budget: null,
        teamSize: null,
        currentSolution: null,
        preferences: [],
        objections: [],
        requestedCallbackOrText: false,
        answeredTopics: new Set()
    };

    const userMessages = (history || [])
        .filter(m => m.role === 'user')
        .map(m => String(m.content || '').trim());

    for (const msg of userMessages) {
        const lower = msg.toLowerCase();

        // 1. Budget extraction (must include explicit monetary unit or keywords)
        const budgetMatch = lower.match(/(?:budget|around|about|under|max|price is|cost is)\s*(\d+(?:\.\d+)?\s*(?:cr|crore|lakh|k|thousand|usd|\$)?)/i);
        if (budgetMatch && budgetMatch[1] && !/employees|people|users|members|staff|team/i.test(lower)) {
            facts.budget = budgetMatch[1].trim();
            facts.answeredTopics.add('budget');
        } else if (/\b(1 cr|2 cr|50k|100k|\$\d+|\d+ cr|\d+ lakh|\d+ crore)\b/i.test(lower)) {
            const m = lower.match(/\b(1 cr|2 cr|50k|100k|\$\d+|\d+ cr|\d+ lakh|\d+ crore)\b/i);
            facts.budget = m[1].toUpperCase();
            facts.answeredTopics.add('budget');
        }

        // 2. Team size / Employee count extraction (with correction handling)
        const teamMatch = lower.match(/(\d+)\s*(?:employees|people|users|members|staff|team)/i);
        if (teamMatch && teamMatch[1]) {
            facts.teamSize = parseInt(teamMatch[1], 10);
            facts.answeredTopics.add('team_size');
        }
        // Correction pattern: "10 people... actually 20" or "mean 20"
        const correctionMatch = lower.match(/(?:actually|mean|sorry|make that)\s*(\d+)/i);
        if (correctionMatch && correctionMatch[1]) {
            facts.teamSize = parseInt(correctionMatch[1], 10);
        }

        // 3. Current solution / Competitor
        const solutionMatch = lower.match(/(?:using|use|have|with|from)\s+([A-Za-z0-9\s]+?)(?:\.|\,|$| right now| currently)/i);
        if (solutionMatch && /competitor|abc|xyz|other|instagram|wordpress|shopify|excel/i.test(solutionMatch[1])) {
            facts.currentSolution = solutionMatch[1].trim();
            facts.answeredTopics.add('current_solution');
        }

        // 4. Preferred location / Type
        if (/karanagar|downtown|2bhk|3bhk|apartment|villa|house|office/i.test(lower)) {
            const prefMatch = lower.match(/(2bhk|3bhk|karanagar|downtown|apartment|villa|house|office)/gi);
            if (prefMatch) {
                prefMatch.forEach(p => facts.preferences.push(p.toUpperCase()));
                facts.answeredTopics.add('preference');
            }
        }

        // 5. Preferred time / Day
        if (/morning|afternoon|evening|wednesday|thursday|friday|monday|tuesday|weekend|2 pm|10 am/i.test(lower)) {
            const timeMatch = lower.match(/(morning|afternoon|evening|wednesday|thursday|friday|monday|tuesday|weekend|2 pm|10 am)/gi);
            if (timeMatch) {
                timeMatch.forEach(t => facts.preferences.push(t.toLowerCase()));
                facts.answeredTopics.add('meeting_time');
            }
        }

        // 6. Objections
        if (/cheaper|expensive|high price|cost too much/i.test(lower)) {
            facts.objections.push('price_too_high');
        }
        if (/no time|busy|don't have time|dont have time/i.test(lower)) {
            facts.objections.push('no_time');
        }
        if (/think about it|need to think|discuss with partner/i.test(lower)) {
            facts.objections.push('need_to_think');
        }

        // 7. Request callback / text
        if (/write to me|text me|send details|call back|call me back|get back/i.test(lower)) {
            facts.requestedCallbackOrText = true;
        }
    }

    // Deduplicate preferences
    facts.preferences = Array.from(new Set(facts.preferences));
    facts.objections = Array.from(new Set(facts.objections));

    return facts;
}

export function determineConversationStage(history = [], facts = {}) {
    const lastUserMsg = (history.filter(m => m.role === 'user').pop()?.content || '').toLowerCase();

    if (facts.requestedCallbackOrText || /write|text|call back|call me later/i.test(lastUserMsg)) {
        return 'CALLBACK_OR_TEXT_REQUESTED';
    }

    if (facts.objections && facts.objections.length > 0 || /cheaper|expensive|think about it|busy/i.test(lastUserMsg)) {
        return 'OBJECTION_HANDLING';
    }

    if (/how much|cost|price|pricing|rate|fee/i.test(lastUserMsg)) {
        return 'PRICE_DISCUSSION';
    }

    if (/whatsapp|features|support|how does it work|demo|visit|location/i.test(lastUserMsg)) {
        return 'PRODUCT_DISCUSSION';
    }

    if (facts.answeredTopics && facts.answeredTopics.has('meeting_time') || /yes|sure|book|schedule|let's do it/i.test(lastUserMsg)) {
        return 'CLOSING';
    }

    if (history.length <= 2) return 'GREETING';

    return 'DISCOVERY';
}

export function formatMemoryForPrompt(facts = {}, stage = 'DISCOVERY') {
    const lines = [];

    lines.push(`CURRENT CONVERSATION STAGE: ${stage}`);
    lines.push(`STRUCTURED CUSTOMER MEMORY (VERIFIED FACTS — DO NOT RE-ASK):`);

    if (facts.budget) lines.push(`- Customer Budget: ${facts.budget}`);
    if (facts.teamSize) lines.push(`- Team Size: ${facts.teamSize} users/employees`);
    if (facts.currentSolution) lines.push(`- Current Solution: ${facts.currentSolution}`);
    if (facts.preferences && facts.preferences.length > 0) lines.push(`- Preferences: ${facts.preferences.join(', ')}`);
    if (facts.objections && facts.objections.length > 0) lines.push(`- Raised Objections: ${facts.objections.join(', ')}`);

    if (lines.length === 2) {
        lines.push(`- (No specific facts extracted yet — listen carefully to customer details)`);
    }

    lines.push(`
CRITICAL MEMORY RULES:
1. Never ask for information listed above — it is ALREADY KNOWN.
2. Address the customer's LATEST message directly. If they asked about price or WhatsApp, answer that immediately.
3. Do NOT restart your introduction or repeat past answers.
4. If customer gave a correction (e.g. 10... actually 20), use the corrected value (20).
`);

    return lines.join('\n');
}
