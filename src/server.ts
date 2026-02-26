import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Orchestrator } from './services/kafkaOrchestrator';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Adjust for production
        methods: ["GET", "POST"]
    }
});

const orchestrator = new Orchestrator();

app.use(cors());
app.use(express.json());

// Main Entry Point
async function bootstrap() {
    await orchestrator.init();

    // Listen for insights from Kafka and broadcast to specific clients
    await orchestrator.startInsightListener((sessionId, insight) => {
        console.log(`Sending insight to session ${sessionId}:`, insight.content);
        // We broadcast to the room named after sessionId
        io.to(sessionId).emit('insight', insight);
    });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        // Initial session setup
        socket.on('start-call', async (data: { sessionId: string, title: string }) => {
            const { sessionId, title } = data;

            if (!sessionId) {
                socket.emit('error', { message: 'Missing sessionId' });
                return;
            }

            console.log(`Starting/Resuming call session: ${sessionId} - ${title}`);

            // Join a room named after the sessionId to handle multiple sockets/reconnections
            socket.join(sessionId);

            // We could store session metadata in Postgres here
            // e.g., await db.callSession.upsert({ ... })
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
            console.log(`Feedback received for ${data.id} in session ${data.sessionId}: ${data.status}`);
            // Store in DB asynchronously
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
        console.log(`Wingman Backend running on port ${PORT}`);
    });
}

bootstrap().catch(console.error);
