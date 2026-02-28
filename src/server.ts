import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import cors from 'cors';
import * as googleTTS from 'google-tts-api';
import { Orchestrator } from './services/kafkaOrchestrator';
import { CallSessionService } from './services/callSessionService';
import { UserRepository } from './repositories/UserRepository';
import { CallSessionRepository } from './repositories/CallSessionRepository';
import { RecommendationRepository } from './repositories/RecommendationRepository';
import logger from './utils/logger';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Adjust for production
        methods: ["GET", "POST"]
    }
});

const orchestrator = new Orchestrator();

// Layered DI: Repositories → Service
const callSessionService = new CallSessionService(
    new UserRepository(),
    new CallSessionRepository(),
    new RecommendationRepository()
);

// In-memory map to track active sessions and their accumulated transcripts
const activeTranscripts = new Map<string, string>();

app.use(cors());
app.use(express.json());

// TTS Simulation Endpoint
app.post('/api/simulate-tts', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required for TTS simulation' });
        }

        // google-tts-api limits chunks to 200 characters. 
        // We will split the text and get base64 audio for all chunks.
        const audioResults = await googleTTS.getAllAudioBase64(text, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
            splitPunct: ',.?'
        });

        // The google-tts-api returns an array of base64 chunks.
        // For simplicity we return them directly so the frontend can stitch and play them back to back
        res.json({ audioChunks: audioResults });
    } catch (error) {
        logger.error("TTS Error", { error });
        res.status(500).json({ error: 'Failed to generate TTS' });
    }
});

// Main Entry Point
export async function bootstrap() {
    await orchestrator.init();

    // Start consuming and processing raw audio chunks
    await orchestrator.startAudioProcessor();

    // Listen for insights from Kafka and broadcast to specific clients
    await orchestrator.startInsightListener((sessionId, insight) => {
        logger.info(`Sending insight to session ${sessionId}`, { sessionId, insight: insight.content });
        // We broadcast to the room named after sessionId
        io.to(sessionId).emit('insight', insight);
    });

    // Listen for transcripts and broadcast
    await orchestrator.startTranscriptListener((sessionId, data) => {
        io.to(sessionId).emit('transcript', data);
    });

    io.on('connection', (socket) => {
        logger.info('Client connected', { socketId: socket.id });

        // Initial session setup
        socket.on('start-call', async (data: { sessionId?: string, title: string }) => {
            const tracer = trace.getTracer('wingman-websocket');
            await tracer.startActiveSpan('socket.start-call', async (span) => {
                try {
                    const title = data.title || 'Untitled Call';
                    span.setAttribute('call.title', title);

                    // Create a new CallSession in the DB with the default admin user
                    const session = await callSessionService.startSession(title);
                    const sessionId = session.id;
                    span.setAttribute('call.session_id', sessionId);

                    logger.info(`Call session created in DB`, { sessionId, title });

                    // Join a room named after the DB session ID
                    socket.join(sessionId);
                    activeTranscripts.set(sessionId, '');

                    // Send the DB-assigned session ID back to the client
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

        // Handle streaming audio chunks
        socket.on('audio-chunk', async (data: { sessionId: string, chunk: Buffer }) => {
            const { sessionId, chunk } = data;
            if (!sessionId) return;

            // Pipeline: Client -> Socket -> Kafka -> Transcription Service
            await orchestrator.handleAudioChunk(sessionId, chunk);
        });

        // Manual feedback handle
        socket.on('feedback', async (data: { sessionId: string, id: string, status: string }) => {
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
                    logger.error('Error recording feedback', { error });
                    span.end();
                }
            });
        });

        // End call: persist the full transcript
        socket.on('end-call', async (data: { sessionId: string }) => {
            const tracer = trace.getTracer('wingman-websocket');
            await tracer.startActiveSpan('socket.end-call', async (span) => {
                try {
                    const { sessionId } = data;
                    span.setAttribute('call.session_id', sessionId);

                    const transcript = activeTranscripts.get(sessionId) || '';
                    await callSessionService.endSession(sessionId, transcript);
                    activeTranscripts.delete(sessionId);
                    logger.info(`Call session ended and persisted`, { sessionId });
                    span.end();
                } catch (error) {
                    span.recordException(error as Error);
                    logger.error('Error ending call session', { error });
                    span.end();
                }
            });
        });

        socket.on('disconnect', () => {
            logger.info('Client disconnected', { socketId: socket.id });
        });
    });

    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
        logger.info(`Wingman Backend running on port ${PORT}`);
    });
}
