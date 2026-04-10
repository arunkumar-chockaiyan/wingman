import logger from './logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INPUT_CHARS = 2_000;
const MAX_OUTPUT_CHARS = 1_000;

const INJECTION_PATTERNS: RegExp[] = [
    /ignore (previous|above|prior|all) instructions/i,
    /you are now/i,
    /new (system )?prompt/i,
    /\[INST\]/i,
    /\[\/INST\]/i,
    /<<SYS>>/i,
    /disregard (your|the) (instructions|system prompt)/i,
    /act as (a|an) (?!sales|assistant|coach)/i, // allow legitimate persona refs
];

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[CARD]' },
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
    { pattern: /\b[\w.+-]+@[\w-]+\.\w{2,}\b/g, replacement: '[EMAIL]' },
    { pattern: /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE]' },
];

// ---------------------------------------------------------------------------
// Input guardrail
// ---------------------------------------------------------------------------

/**
 * Sanitize a transcript before it is sent to an LLM.
 * Returns the cleaned string, or null if the input should be rejected entirely.
 */
export function sanitizeInput(agentId: string, transcript: string): string | null {
    if (!transcript || transcript.trim().length === 0) return null;

    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(transcript)) {
            logger.warn('guardrails: prompt injection attempt detected — input rejected', {
                agentId,
                pattern: pattern.toString(),
            });
            return null;
        }
    }

    if (transcript.length > MAX_INPUT_CHARS) {
        logger.warn('guardrails: input truncated to max length', {
            agentId,
            originalLength: transcript.length,
            maxLength: MAX_INPUT_CHARS,
        });
        return transcript.slice(0, MAX_INPUT_CHARS);
    }

    return transcript;
}

// ---------------------------------------------------------------------------
// Output guardrail
// ---------------------------------------------------------------------------

/**
 * Validate LLM output before publishing downstream.
 * Returns the (possibly truncated) output, or null if it should be dropped.
 */
export function validateOutput(agentId: string, output: string): string | null {
    if (!output || output.trim().length === 0) {
        logger.warn('guardrails: empty output from LLM — dropping', { agentId });
        return null;
    }

    if (output.length > MAX_OUTPUT_CHARS) {
        logger.warn('guardrails: output truncated to max length', {
            agentId,
            originalLength: output.length,
            maxLength: MAX_OUTPUT_CHARS,
        });
        return output.slice(0, MAX_OUTPUT_CHARS);
    }

    return output;
}

// ---------------------------------------------------------------------------
// PII redaction
// ---------------------------------------------------------------------------

/**
 * Redact common PII patterns from a transcript before it enters Kafka.
 * Applied at the boundary between Vosk output and the transcripts topic.
 */
export function redactPII(transcript: string): string {
    return PII_PATTERNS.reduce(
        (text, { pattern, replacement }) => text.replace(pattern, replacement),
        transcript,
    );
}
