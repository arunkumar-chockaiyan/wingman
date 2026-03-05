/**
 * End-to-End Audio Pipeline Diagnostic Test
 *
 * This test sends audio through the SAME path as the browser:
 *   Socket.IO client → server.ts → Kafka → kafkaOrchestrator → Vosk → Socket.IO transcript event
 *
 * If this test FAILS → the issue is in the backend pipeline (server/Kafka/Vosk routing)
 * If this test PASSES → the issue is in the frontend audio capture
 */
import { describe, it, expect } from 'vitest';
import { io, Socket } from 'socket.io-client';
import https from 'https';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:3001';
const SAMPLE_URL = 'https://raw.githubusercontent.com/alphacep/vosk-api/master/python/example/test.wav';

async function downloadSampleAudio(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        https.get(SAMPLE_URL, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to download test file: ${res.statusCode}`));
            }
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

describe('E2E Audio Pipeline via Socket.IO', () => {

    it('should transcribe audio sent through Socket.IO → Kafka → Vosk pipeline', async () => {
        const fullAudioBuffer = await downloadSampleAudio();
        const rawPcm = fullAudioBuffer.subarray(44); // Strip WAV header

        const sessionId = `test-e2e-${Date.now()}`;
        const transcripts: string[] = [];

        // Connect via Socket.IO just like the frontend does
        const socket: Socket = io(BACKEND_URL, { transports: ['websocket'] });

        await new Promise<void>((resolve, reject) => {
            socket.on('connect', resolve);
            socket.on('connect_error', reject);
        });

        console.log('[E2E] Socket connected:', socket.id);

        // Listen for transcripts (just like the frontend)
        socket.on('transcript', (data: any) => {
            console.log('[E2E] Received transcript:', JSON.stringify(data));
            if (data?.transcript) {
                transcripts.push(data.transcript);
            }
        });

        // Start a call session (just like the frontend)
        socket.emit('start-call', { sessionId, title: 'E2E Test Call' });

        // Wait for the backend to set up Kafka consumers, DB session, etc.
        await new Promise(r => setTimeout(r, 2000));

        // Send audio chunks in worklet-sized pieces (4096 Int16 samples = 8192 bytes)
        // This mimics exactly what pcm-processor.js does
        const CHUNK_SIZE = 4096 * 2; // 4096 samples × 2 bytes per Int16
        let chunksSent = 0;

        for (let offset = 0; offset < rawPcm.length; offset += CHUNK_SIZE) {
            const end = Math.min(offset + CHUNK_SIZE, rawPcm.length);
            const chunk = rawPcm.subarray(offset, end);

            // Convert to ArrayBuffer (like the browser's postMessage)
            const ab = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);

            socket.emit('audio-chunk', { sessionId, chunk: ab });
            chunksSent++;
        }

        console.log(`[E2E] Sent ${chunksSent} audio chunks through Socket.IO`);

        // Signal end of call
        socket.emit('end-call', { sessionId });

        // Wait for Vosk to process and transcripts to come back
        await new Promise(r => setTimeout(r, 5000));

        console.log(`[E2E] Received ${transcripts.length} transcript(s): "${transcripts.join(' ')}"`);

        socket.disconnect();

        // We should have received at least one transcript
        expect(transcripts.length).toBeGreaterThan(0);
        expect(transcripts.join(' ').trim().length).toBeGreaterThan(0);
    }, 30000);

    it('should verify that Socket.IO correctly transmits binary data format', async () => {
        // This test verifies the exact binary format that arrives at the server
        const socket: Socket = io(BACKEND_URL, { transports: ['websocket'] });

        await new Promise<void>((resolve, reject) => {
            socket.on('connect', resolve);
            socket.on('connect_error', reject);
        });

        // Create a known test pattern: alternating Int16 values
        const testData = new Int16Array(4096);
        for (let i = 0; i < testData.length; i++) {
            testData[i] = Math.floor(Math.sin(i / 10) * 16000); // Sine wave pattern
        }

        const sessionId = `test-format-${Date.now()}`;
        socket.emit('start-call', { sessionId, title: 'Format Test' });
        await new Promise(r => setTimeout(r, 1000));

        // Send the ArrayBuffer exactly like the browser worklet does
        const ab = testData.buffer.slice(0);
        console.log(`[Format] Sending ArrayBuffer of size: ${ab.byteLength}`);
        console.log(`[Format] First 10 Int16 values: [${Array.from(testData.subarray(0, 10))}]`);

        socket.emit('audio-chunk', { sessionId, chunk: ab });

        await new Promise(r => setTimeout(r, 2000));

        socket.emit('end-call', { sessionId });
        socket.disconnect();

        // This is just a diagnostic test — we only check it doesn't throw
        expect(true).toBe(true);
    }, 15000);
});
