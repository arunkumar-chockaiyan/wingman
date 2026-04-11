import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import cors from 'cors';
import * as googleTTS from 'google-tts-api';
import { Orchestrator } from './services/kafkaOrchestrator';
import { CallSessionService } from './services/callSessionService';
import { UserRepository } from './repositories/UserRepository';
import { CallSessionRepository } from './repositories/CallSessionRepository';
import { RecommendationRepository } from './repositories/RecommendationRepository';
import logger from './utils/logger';
import { sanitizeInput, validateOutput } from './utils/guardrails';
import { contextStore, REP_CONTEXT_LIMITS } from './services/contextStore';
import { createGeminiModel } from './config/geminiConfig';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_AUDIO_CHUNK_BYTES = 1024 * 1024; // 1 MB hard cap per chunk
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
const httpServer = createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
    },
});

export const orchestrator = new Orchestrator();

// Layered DI: Repositories → Service
const callSessionService = new CallSessionService(
    new UserRepository(),
    new CallSessionRepository(),
    new RecommendationRepository()
);

// In-memory map to track active sessions and their accumulated transcripts
const activeTranscripts = new Map<string, string>();

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ---------------------------------------------------------------------------
// TTS Simulation Endpoint
// ---------------------------------------------------------------------------

app.post('/api/simulate-tts', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required for TTS simulation' });
        }

        // google-tts-api limits chunks to 200 characters.
        // We split the text and get base64 audio for all chunks.
        const audioResults = await googleTTS.getAllAudioBase64(text, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
            splitPunct: ',.?'
        });

        // Return the array of base64 chunks so the frontend can stitch and play them back-to-back.
        res.json({ audioChunks: audioResults });
    } catch (error) {
        logger.error("TTS Error", { error });
        res.status(500).json({ error: 'Failed to generate TTS' });
    }
});

// ---------------------------------------------------------------------------
// Summary helper — called internally on every Nth utterance
// ---------------------------------------------------------------------------

const SUMMARY_SYSTEM_PROMPT = `You are summarizing an ongoing B2B sales call in real time for the salesperson's reference.
Based on the transcript so far, provide a concise live summary using exactly this format — each item on its own line starting with "•":
• Key topics discussed
• Customer's stated needs or concerns
• Any objections raised
• Action items or commitments mentioned

Rules:
- Maximum 5 bullet points total
- Each bullet must be one sentence, direct and actionable
- If the transcript is too short to summarize, respond with only: "• Call just started — not enough context yet."
- Do not add headers, preamble, or closing remarks`;

async function generateAndEmitSummary(sessionId: string): Promise<void> {
    const history = contextStore.getHistory(sessionId);
    if (!history.trim()) {
        io.to(sessionId).emit('summary-done');
        return;
    }

    const safeInput = sanitizeInput('summarizer', history);
    if (!safeInput) {
        io.to(sessionId).emit('summary-done');
        return;
    }

    try {
        const model = createGeminiModel();

        io.to(sessionId).emit('summary-start');

        const result = await model.generateContentStream([SUMMARY_SYSTEM_PROMPT, `Transcript so far:\n${safeInput}`]);

        let accumulated = '';
        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
                accumulated += text;
                io.to(sessionId).emit('summary-chunk', { chunk: text });
            }
        }

        io.to(sessionId).emit('summary-done');
        logger.info('Summary streamed', { sessionId, chars: accumulated.length });
    } catch (err) {
        logger.error('generateAndEmitSummary error', { sessionId, error: err });
        io.to(sessionId).emit('summary-done');
    }
}

// ---------------------------------------------------------------------------
// Call History REST Endpoints
// ---------------------------------------------------------------------------

app.get('/api/sessions', async (_req, res) => {
    try {
        const sessions = await callSessionService.listSessions();
        res.json(sessions);
    } catch (err) {
        logger.error('GET /api/sessions error', { error: err });
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

app.get('/api/sessions/:id', async (req, res) => {
    try {
        const session = await callSessionService.getSession(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        logger.error('GET /api/sessions/:id error', { error: err });
        res.status(500).json({ error: 'Failed to fetch session' });
    }
});

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export async function bootstrap() {
    await orchestrator.init();

    // Start consuming and processing raw audio chunks
    await orchestrator.startAudioProcessor();

    // Listen for insights from Kafka, persist to DB, then broadcast with the DB id
    await orchestrator.startInsightListener(async (sessionId, insight: unknown) => {
        const i = insight as { agentId?: string; category?: string; content?: string };
        logger.info(`Saving insight for session ${sessionId}`, { sessionId, content: i.content });

        let dbId: string | undefined;
        try {
            const rec = await callSessionService.saveInsight({
                callSessionId:  sessionId,
                content:        i.content  ?? '',
                category:       i.category ?? 'General',
                agentId:        i.agentId  ?? 'unknown',
            });
            dbId = rec.id;
        } catch (err) {
            logger.error('Failed to persist insight', { sessionId, error: err });
        }

        io.to(sessionId).emit('insight', { ...i, id: dbId, timestamp: Date.now() });
    });

    // Listen for partial (in-progress) transcripts from Vosk and stream to client immediately
    orchestrator.onPartialTranscript((sessionId, partial) => {
        io.to(sessionId).emit('partial-transcript', { transcript: partial, timestamp: Date.now() });
    });

    // Listen for final transcripts, broadcast to client, and trigger summary when due
    await orchestrator.startTranscriptListener((sessionId, data) => {
        io.to(sessionId).emit('transcript', data);

        // Append to the active session transcript so it can be saved when the call ends
        const current = activeTranscripts.get(sessionId) ?? '';
        activeTranscripts.set(sessionId, current + ' ' + data.transcript);

        // Trigger summary generation every N utterances (utterCount is in the Kafka message)
        const utterCount = (data as any).utterCount as number | undefined;
        if (utterCount !== undefined && contextStore.shouldEmitSummary(utterCount)) {
            generateAndEmitSummary(sessionId).catch(err =>
                logger.error('Summary generation failed', { sessionId, error: err })
            );
        }
    });

    // -----------------------------------------------------------------------
    // Socket.io connection handler
    // -----------------------------------------------------------------------

    io.on('connection', (socket) => {
        logger.info('Client connected', { socketId: socket.id });

        // Track the session bound to this socket for cleanup on disconnect
        let currentSessionId: string | null = null;

        // -------------------------------------------------------------------
        // start-call
        // -------------------------------------------------------------------

        socket.on('start-call', async (data: { sessionId?: string; title: string }) => {
            const tracer = trace.getTracer('wingman-websocket');
            await tracer.startActiveSpan('socket.start-call', async (span) => {
                try {
                    const title = data.title || 'Untitled Call';
                    span.setAttribute('call.title', title);

                    // Validate the client-provided session ID
                    if (data.sessionId && !UUID_RE.test(data.sessionId)) {
                        socket.emit('error', { message: 'Invalid sessionId format' });
                        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid sessionId' });
                        span.end();
                        return;
                    }

                    const session = await callSessionService.startSession(title, data.sessionId);
                    const sessionId = session.id;
                    span.setAttribute('call.session_id', sessionId);

                    currentSessionId = sessionId;
                    socket.join(sessionId);
                    activeTranscripts.set(sessionId, '');

                    logger.info(`Call session created in DB`, { sessionId, title });
                    socket.emit('session-started', { sessionId, title });
                    span.end();
                } catch (error) {
                    span.recordException(error as Error);
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    logger.error('Error starting call session', { error });
                    socket.emit('error', { message: 'Failed to start call session' });
                    span.end();
                }
            });
        });

        // -------------------------------------------------------------------
        // update-rep-context — notes / links / AI instructions from the rep
        // -------------------------------------------------------------------

        socket.on('update-rep-context', async (data: {
            sessionId: string;
            notes?: string;
            links?: string;
            instructions?: string;
        }) => {
            const { sessionId, notes, links, instructions } = data;
            if (!sessionId) return;

            // Update the in-memory context store (used by agents immediately)
            contextStore.updateMetadata(sessionId, { notes, links, instructions });

            // Persist to DB (fire-and-forget — non-critical path)
            callSessionService.updateRepContext(sessionId, {
                repNotes: notes,
                repLinks: links,
                repInstructions: instructions,
            }).catch(err => logger.error('Failed to persist rep context', { sessionId, error: err }));

            logger.info('Rep context updated', {
                sessionId,
                notesLen: notes?.length,
                linksLen: links?.length,
                instructionsLen: instructions?.length,
            });
        });

        // -------------------------------------------------------------------
        // audio-chunk
        // -------------------------------------------------------------------

        let chunkCounter = 0;
        socket.on('audio-chunk', async (data: { sessionId: string; chunk: any }) => {
            const { sessionId, chunk } = data;
            if (!sessionId || !chunk) return;

            chunkCounter++;

            // Normalize to a Buffer regardless of how Socket.IO delivered the binary data
            let audioBuffer: Buffer;
            if (Buffer.isBuffer(chunk)) {
                audioBuffer = chunk;
            } else if (chunk instanceof ArrayBuffer) {
                audioBuffer = Buffer.from(chunk);
            } else if (chunk?.type === 'Buffer' && Array.isArray(chunk.data)) {
                audioBuffer = Buffer.from(chunk.data);
            } else if (typeof chunk === 'object' && chunk.byteLength !== undefined) {
                audioBuffer = Buffer.from(chunk);
            } else {
                logger.warn('Received unknown audio chunk format', { sessionId });
                return;
            }

            // Guard against abnormally large payloads
            if (audioBuffer.length > MAX_AUDIO_CHUNK_BYTES) {
                logger.warn('Oversized audio chunk rejected', {
                    sessionId,
                    size: audioBuffer.length,
                    limit: MAX_AUDIO_CHUNK_BYTES,
                });
                return;
            }

            if (chunkCounter <= 3 || chunkCounter % 20 === 0) {
                logger.info(`Received audio chunk #${chunkCounter}`, {
                    sessionId,
                    bufferSize: audioBuffer.length,
                });
            }

            await orchestrator.handleAudioChunk(sessionId, audioBuffer);
        });

        // -------------------------------------------------------------------
        // feedback
        // -------------------------------------------------------------------

        socket.on('feedback', async (data: { sessionId: string; id: string; status: string }) => {
            const tracer = trace.getTracer('wingman-websocket');
            await tracer.startActiveSpan('socket.feedback', async (span) => {
                try {
                    const status = data.status === 'liked' ? 'LIKED' : 'DISLIKED';
                    span.setAttribute('feedback.id', data.id);
                    span.setAttribute('feedback.status', status);

                    await callSessionService.recordFeedback(data.id, status as 'LIKED' | 'DISLIKED');
                    logger.info(`Feedback persisted`, { recommendationId: data.id, status });
                    span.end();
                } catch (error) {
                    span.recordException(error as Error);
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    logger.error('Error recording feedback', { error });
                    span.end();
                }
            });
        });

        // -------------------------------------------------------------------
        // end-call
        // -------------------------------------------------------------------

        socket.on('end-call', async (data: { sessionId: string }) => {
            const tracer = trace.getTracer('wingman-websocket');
            await tracer.startActiveSpan('socket.end-call', async (span) => {
                try {
                    const { sessionId } = data;
                    span.setAttribute('call.session_id', sessionId);

                    // Always generate a final summary when the call ends so short calls
                    // that never hit the per-utterance threshold still get one.
                    generateAndEmitSummary(sessionId).catch(err =>
                        logger.error('End-of-call summary generation failed', { sessionId, error: err })
                    );

                    const transcript = activeTranscripts.get(sessionId) ?? '';
                    await callSessionService.endSession(sessionId, transcript);
                    activeTranscripts.delete(sessionId);
                    orchestrator.closeVoskSession(sessionId);

                    if (currentSessionId === sessionId) currentSessionId = null;

                    logger.info('Call session ended and persisted', { sessionId });
                    span.end();
                } catch (error) {
                    span.recordException(error as Error);
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    logger.error('Error ending call session', { error });
                    span.end();
                }
            });
        });

        // -------------------------------------------------------------------
        // disconnect — clean up any session that wasn't explicitly ended
        // -------------------------------------------------------------------

        socket.on('disconnect', () => {
            logger.info('Client disconnected', { socketId: socket.id });
            if (currentSessionId) {
                activeTranscripts.delete(currentSessionId);
                logger.info('Cleaned up transcript for disconnected session', {
                    sessionId: currentSessionId,
                });
            }
        });
    });

    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
        logger.info(`Wingman Backend running on port ${PORT}`);
    });
}
