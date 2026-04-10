import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';
import { sanitizeInput } from '../utils/guardrails';
import { ENV } from '../config/env';
// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const COMPACTION_CHAR_THRESHOLD = 4_000; // compact history when it exceeds this
export const REP_CONTEXT_LIMITS = {
    notes: 1_000,
    links: 500,
    instructions: 500,
} as const;

const SUMMARY_EVERY_N = 3; // emit a call summary every N final utterances

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepContext {
    notes: string;
    links: string;
    instructions: string;
}

// ---------------------------------------------------------------------------
// ContextStore singleton
// ---------------------------------------------------------------------------

class ContextStore {
    /** Raw (or partially compacted) conversation history, keyed by sessionId. */
    private readonly history = new Map<string, string>();
    /** Sales-rep provided context (notes / links / instructions). */
    private readonly metadata = new Map<string, RepContext>();
    /** Final-utterance count per session — drives summary trigger. */
    private readonly utterCount = new Map<string, number>();
    /** Guard against overlapping compaction runs. */
    private readonly compacting = new Set<string>();

    private readonly genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);

    // -----------------------------------------------------------------------
    // Transcript ingestion
    // -----------------------------------------------------------------------

    /**
     * Append a finalised utterance to the session history.
     * Returns the updated utterance count so the caller can decide whether to
     * trigger a summary.
     */
    appendTranscript(sessionId: string, text: string): number {
        const prev = this.history.get(sessionId) ?? '';
        this.history.set(sessionId, prev ? `${prev}\n${text}` : text);

        const count = (this.utterCount.get(sessionId) ?? 0) + 1;
        this.utterCount.set(sessionId, count);

        // Fire-and-forget — do not block the caller
        this.compactIfNeeded(sessionId).catch(err =>
            logger.error('contextStore: compaction error', { sessionId, error: err })
        );

        return count;
    }

    shouldEmitSummary(count: number): boolean {
        return count % SUMMARY_EVERY_N === 0;
    }

    // -----------------------------------------------------------------------
    // Rep context (notes / links / instructions)
    // -----------------------------------------------------------------------

    updateMetadata(sessionId: string, partial: Partial<RepContext>): void {
        const current = this.metadata.get(sessionId) ?? { notes: '', links: '', instructions: '' };

        const sanitize = (key: keyof RepContext, value: string): string => {
            const limit = REP_CONTEXT_LIMITS[key];
            const safe = sanitizeInput('rep-context', value) ?? '';
            if (safe.length > limit) {
                logger.warn('contextStore: rep context truncated', { sessionId, key, limit });
                return safe.slice(0, limit);
            }
            return safe;
        };

        this.metadata.set(sessionId, {
            notes: partial.notes !== undefined ? sanitize('notes', partial.notes) : current.notes,
            links: partial.links !== undefined ? sanitize('links', partial.links) : current.links,
            instructions: partial.instructions !== undefined ? sanitize('instructions', partial.instructions) : current.instructions,
        });
    }

    // -----------------------------------------------------------------------
    // Context retrieval
    // -----------------------------------------------------------------------

    /** Returns the complete context string sent to every agent. */
    getFullContext(sessionId: string): string {
        const history = this.history.get(sessionId) ?? '';
        const meta = this.metadata.get(sessionId);
        const parts: string[] = [];

        parts.push(`[CONVERSATION SO FAR]\n${history || '(no transcript yet)'}`);

        if (meta?.notes?.trim()) parts.push(`[REP NOTES]\n${meta.notes.trim()}`);
        if (meta?.links?.trim()) parts.push(`[REFERENCE LINKS]\n${meta.links.trim()}`);
        if (meta?.instructions?.trim()) parts.push(`[AI INSTRUCTIONS FROM REP]\n${meta.instructions.trim()}`);

        return parts.join('\n\n');
    }

    /** Raw history string — used by the summary generator. */
    getHistory(sessionId: string): string {
        return this.history.get(sessionId) ?? '';
    }

    // -----------------------------------------------------------------------
    // Compaction
    // -----------------------------------------------------------------------

    private async compactIfNeeded(sessionId: string): Promise<void> {
        const history = this.history.get(sessionId) ?? '';
        if (history.length <= COMPACTION_CHAR_THRESHOLD) return;
        if (this.compacting.has(sessionId)) return;

        this.compacting.add(sessionId);
        try {
            const lines = history.split('\n').filter(Boolean);
            const half = Math.floor(lines.length / 2);
            const older = lines.slice(0, half).join('\n');
            const newer = lines.slice(half).join('\n');

            const model = this.genAI.getGenerativeModel({
                model: ENV.GEMINI_MODEL,
                generationConfig: { maxOutputTokens: 150 },
            });
            const result = await model.generateContent([
                'Summarize this sales call transcript excerpt in 2–3 sentences, preserving key facts, names, and any commitments made:',
                older,
            ]);
            const compacted = result.response.text().trim();
            this.history.set(sessionId, `[Earlier in call — summarised]: ${compacted}\n\n${newer}`);
            logger.info('contextStore: history compacted', { sessionId, was: history.length });
        } catch (err) {
            logger.error('contextStore: compaction failed — keeping recent half', { sessionId, error: err });
            // Fallback: drop older half without summarising
            const lines = history.split('\n').filter(Boolean);
            this.history.set(sessionId, lines.slice(Math.floor(lines.length / 2)).join('\n'));
        } finally {
            this.compacting.delete(sessionId);
        }
    }

    // -----------------------------------------------------------------------
    // Session cleanup
    // -----------------------------------------------------------------------

    cleanup(sessionId: string): void {
        this.history.delete(sessionId);
        this.metadata.delete(sessionId);
        this.utterCount.delete(sessionId);
        this.compacting.delete(sessionId);
    }
}

export const contextStore = new ContextStore();
