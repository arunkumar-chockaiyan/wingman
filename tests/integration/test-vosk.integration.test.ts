import { describe, it, expect, vi } from 'vitest';
import WebSocket from 'ws';
import https from 'https';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const VOSK_URL = process.env.VOSK_URL || 'ws://localhost:2700';
const SAMPLE_URL = 'https://raw.githubusercontent.com/alphacep/vosk-api/master/python/example/test.wav';

// Helper to download the test.wav file
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

describe('Vosk STT Integration Tests', () => {

    it('should transcribe a standard 16kHz WAV file seamlessly', async () => {
        const audioBuffer = await downloadSampleAudio();

        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(VOSK_URL);
            let finalTranscript = '';

            ws.on('open', () => {
                ws.send(JSON.stringify({ config: { sample_rate: 16000 } }));
                ws.send(audioBuffer);
                ws.send('{"eof" : 1}');
            });

            ws.on('message', (data) => {
                const response = JSON.parse(data.toString());
                if (response.text) {
                    finalTranscript += response.text + ' ';
                }
            });

            ws.on('close', () => {
                expect(finalTranscript.length).toBeGreaterThan(0);
                resolve();
            });

            ws.on('error', reject);
        });
    }, 15000); // 15 second timeout

    it('should transcribe audio when chunked using the frontend AudioWorklet logic', async () => {
        const fullAudioBuffer = await downloadSampleAudio();

        // Strip 44 byte WAV header to get pure PCM data used to simulate audio track
        const rawPcm = fullAudioBuffer.subarray(44);

        // Convert to Float32 to simulate browser's Web Audio API input buffer
        const int16View = new Int16Array(rawPcm.buffer, rawPcm.byteOffset, rawPcm.length / 2);
        const float32Array = new Float32Array(int16View.length);
        for (let i = 0; i < int16View.length; i++) {
            // Normalize back to -1.0 to 1.0 range
            float32Array[i] = int16View[i] / (int16View[i] < 0 ? 0x8000 : 0x7FFF);
        }

        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(VOSK_URL);
            let finalTranscript = '';

            ws.on('open', () => {
                ws.send(JSON.stringify({ config: { sample_rate: 16000 } }));

                // === SAME CODE AS useWingmanSession.ts (pcm-processor.js) ===
                const bufferSize = 4096;
                let buffer = new Float32Array(bufferSize);
                let framesCount = 0;

                for (let i = 0; i < float32Array.length; i++) {
                    buffer[framesCount++] = float32Array[i];

                    if (framesCount >= bufferSize) {
                        const pcmData = new Int16Array(bufferSize);
                        for (let j = 0; j < bufferSize; j++) {
                            const s = Math.max(-1, Math.min(1, buffer[j]));
                            pcmData[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                        }

                        // Send as node Buffer just as Express receives it via Socket.io
                        ws.send(Buffer.from(pcmData.buffer));

                        buffer = new Float32Array(bufferSize);
                        framesCount = 0;
                    }
                }

                // Send EOF when done simulating stream
                ws.send('{"eof" : 1}');
            });

            ws.on('message', (data) => {
                const response = JSON.parse(data.toString());
                if (response.text) {
                    finalTranscript += response.text + ' ';
                }
            });

            ws.on('close', () => {
                expect(finalTranscript.trim().length).toBeGreaterThan(0);
                resolve();
            });

            ws.on('error', reject);
        });
    }, 15000);
});
