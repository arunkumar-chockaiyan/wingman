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
// Main Entry Point
// ---------------------------------------------------------------------------

export async function bootstrap() {
    await orchestrator.init();

    // Start consuming and processing raw audio chunks
    await orchestrator.startAudioProcessor();

    // Listen for insights from Kafka and broadcast to specific clients
    await orchestrator.startInsightListener((sessionId, insight: unknown) => {
        logger.info(`Sending insight to session ${sessionId}`, {
            sessionId,
            insight: (insight as { content?: string })?.content,
        });
        io.to(sessionId).emit('insight', insight);
    });

    // Listen for transcripts and broadcast
    await orchestrator.startTranscriptListener((sessionId, data) => {
        io.to(sessionId).emit('transcript', data);

        // Append to the active session transcript so it can be saved when the call ends
        const current = activeTranscripts.get(sessionId) ?? '';
        activeTranscripts.set(sessionId, current + ' ' + data.transcript);
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
