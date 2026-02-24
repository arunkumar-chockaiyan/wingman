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
        io.to(sessionId).emit('insight', insight);
    });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        // Initial session setup
        socket.on('start-call', async (data: { title: string }) => {
            const sessionId = socket.id; // Using socket ID for now as session ID
            socket.join(sessionId);
            console.log(`Starting call session: ${sessionId} - ${data.title}`);

            // We could store session metadata in Postgres here
        });

        // Handle streaming audio chunks
        socket.on('audio-chunk', async (chunk: Buffer) => {
            const sessionId = socket.id;
            // Pipeline: Client -> Socket -> Kafka -> Transcription Service
            await orchestrator.handleAudioChunk(sessionId, chunk);
        });

        // Manual feedback handle
        socket.on('feedback', async (data: { id: string, status: string }) => {
            console.log(`Feedback received for ${data.id}: ${data.status}`);
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
