// System Constants and Enterprise Configurations

export const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    AGENT: 'AGENT',
    VIEWER: 'VIEWER'
};

export const ORG_STATUSES = {
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    DELETED: 'deleted'
};

export const USER_STATUSES = {
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    DELETED: 'deleted'
};

export const ORG_PLANS = {
    FREE: 'free',
    STARTER: 'starter',
    PROFESSIONAL: 'professional',
    ENTERPRISE: 'enterprise'
};

export const QUALIFICATIONS = {
    INTERESTED: 'Interested',
    NOT_INTERESTED: 'Not Interested',
    FOLLOW_UP: 'Follow Up Needed',
    UNKNOWN: 'Unknown'
};

export const CALL_STATUSES = {
    INITIATED: 'initiated',
    RINGING: 'ringing',
    ANSWERED: 'answered',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    BUSY: 'busy',
    NO_ANSWER: 'no_answer',
    CANCELED: 'canceled'
};

export const CAMPAIGN_STATUSES = {
    DRAFT: 'draft',
    QUEUED: 'queued',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELED: 'canceled'
};

export const ERROR_CODES = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    ORGANIZATION_SUSPENDED: 'ORGANIZATION_SUSPENDED',
    USER_SUSPENDED: 'USER_SUSPENDED',
    USER_LIMIT_REACHED: 'USER_LIMIT_REACHED',
    LEAD_LIMIT_REACHED: 'LEAD_LIMIT_REACHED',
    TELEPHONY_ERROR: 'TELEPHONY_ERROR',
    LLM_ERROR: 'LLM_ERROR',
    TTS_ERROR: 'TTS_ERROR',
    INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR'
};

// Unit Cost Estimates for Real-time Financial Tracking
export const COST_RATES = {
    TWILIO_PER_MINUTE: 0.014,    // $0.014 / minute
    LLM_PER_CALL: 0.0005,         // ~$0.0005 / call
    TTS_PER_CHARACTER: 0.000015   // ~$0.015 / 1000 characters
};
