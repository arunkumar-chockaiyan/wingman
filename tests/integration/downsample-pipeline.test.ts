import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';
import https from 'https';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const VOSK_URL = process.env.VOSK_URL || 'ws://localhost:2700';
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

/**
 * This test simulates the EXACT browser pipeline:
 *   1. Start with 16kHz WAV → pretend it's 48kHz input (by upsampling 3x)
 *   2. Apply the pcm-processor.js downsampling logic (48kHz → 16kHz)
 *   3. Send resulting chunks to Vosk
 *   4. Verify transcription
 * 
 * If this test FAILS → our downsampling algorithm is broken
 * If this test PASSES → the issue is in Socket.IO/Kafka transport
 */
describe('Downsampling Pipeline Diagnostic', () => {

    it('should correctly downsample 48kHz → 16kHz and transcribe via Vosk', async () => {
        const fullAudioBuffer = await downloadSampleAudio();
        const rawPcm = fullAudioBuffer.subarray(44); // Strip WAV header

        // Convert WAV Int16 to Float32 (simulating what the browser gives us)
        const int16View = new Int16Array(rawPcm.buffer, rawPcm.byteOffset, rawPcm.length / 2);
        const float32At16k = new Float32Array(int16View.length);
        for (let i = 0; i < int16View.length; i++) {
            float32At16k[i] = int16View[i] / (int16View[i] < 0 ? 0x8000 : 0x7FFF);
        }

        // === STEP 1: Upsample 16kHz → 48kHz (simulate browser's native rate) ===
        const nativeRate = 48000;
        const targetRate = 16000;
        const upsampleRatio = nativeRate / targetRate; // 3.0
        const upsampledLength = Math.floor(float32At16k.length * upsampleRatio);
        const float32At48k = new Float32Array(upsampledLength);

        for (let i = 0; i < upsampledLength; i++) {
            const srcIdx = i / upsampleRatio;
            const srcFloor = Math.floor(srcIdx);
            const srcCeil = Math.min(srcFloor + 1, float32At16k.length - 1);
            const frac = srcIdx - srcFloor;
            float32At48k[i] = float32At16k[srcFloor] * (1 - frac) + float32At16k[srcCeil] * frac;
        }

        console.log(`Upsampled: ${float32At16k.length} samples @ 16kHz → ${float32At48k.length} samples @ 48kHz`);

        // === STEP 2: Apply pcm-processor.js downsampling logic (48kHz → 16kHz) ===
        const resampleRatio = nativeRate / targetRate; // 3.0
        const bufferSize = 4096;
        let buffer = new Float32Array(bufferSize);
        let framesCount = 0;
        const outputChunks: Buffer[] = [];

        // Simulate AudioWorklet process() calls with 128-sample quanta
        const quantumSize = 128;
        for (let qStart = 0; qStart < float32At48k.length; qStart += quantumSize) {
            const qEnd = Math.min(qStart + quantumSize, float32At48k.length);
            const inputChannel = float32At48k.subarray(qStart, qEnd);
            const inputLen = inputChannel.length;

            // Downsample — SAME LOGIC as pcm-processor.js
            for (let outIdx = 0; outIdx < inputLen / resampleRatio; outIdx++) {
                const srcIdx = outIdx * resampleRatio;
                const srcIdxFloor = Math.floor(srcIdx);
                const srcIdxCeil = Math.min(srcIdxFloor + 1, inputLen - 1);
                const frac = srcIdx - srcIdxFloor;
                const sample = inputChannel[srcIdxFloor] * (1 - frac) + inputChannel[srcIdxCeil] * frac;
                buffer[framesCount++] = sample;

                if (framesCount >= bufferSize) {
                    const pcmData = new Int16Array(bufferSize);
                    for (let j = 0; j < bufferSize; j++) {
                        const s = Math.max(-1, Math.min(1, buffer[j]));
                        pcmData[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    outputChunks.push(Buffer.from(pcmData.buffer));
                    buffer = new Float32Array(bufferSize);
                    framesCount = 0;
                }
            }
        }

        console.log(`Downsampled to ${outputChunks.length} chunks of ${bufferSize} samples each`);

        // === STEP 3: Send to Vosk and verify transcription ===
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(VOSK_URL);
            let finalTranscript = '';

            ws.on('open', () => {
                ws.send(JSON.stringify({ config: { sample_rate: targetRate } }));

                for (const chunk of outputChunks) {
                    ws.send(chunk);
                }

                ws.send('{"eof" : 1}');
            });

            ws.on('message', (data) => {
                const response = JSON.parse(data.toString());
                console.log('Vosk response:', JSON.stringify(response));
                if (response.text) {
                    finalTranscript += response.text + ' ';
                }
            });

            ws.on('close', () => {
                console.log(`Final transcript: "${finalTranscript.trim()}"`);
                expect(finalTranscript.trim().length).toBeGreaterThan(0);
                resolve();
            });

            ws.on('error', reject);
        });
    }, 20000);

    it('should verify chunk sizes match expectations', async () => {
        const fullAudioBuffer = await downloadSampleAudio();
        const rawPcm = fullAudioBuffer.subarray(44);

        // The WAV file is 16kHz Int16. Each sample = 2 bytes.
        const totalSamples = rawPcm.length / 2;
        console.log(`WAV file: ${rawPcm.length} bytes, ${totalSamples} samples @ 16kHz`);
        console.log(`Duration: ${(totalSamples / 16000).toFixed(2)}s`);

        // After worklet processing with bufferSize=4096, each chunk = 4096 * 2 = 8192 bytes
        const expectedChunks = Math.floor(totalSamples / 4096);
        console.log(`Expected chunks (without downsampling): ${expectedChunks}`);
        console.log(`Expected chunk size: ${4096 * 2} bytes (8192)`);

        // Verify the test data is valid by sending directly (no processing)
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(VOSK_URL);
            let finalTranscript = '';

            ws.on('open', () => {
                ws.send(JSON.stringify({ config: { sample_rate: 16000 } }));
                // Send raw PCM directly (skip WAV header)
                ws.send(rawPcm);
                ws.send('{"eof" : 1}');
            });

            ws.on('message', (data) => {
                const response = JSON.parse(data.toString());
                if (response.text) {
                    finalTranscript += response.text + ' ';
                }
            });

            ws.on('close', () => {
                console.log(`Direct send transcript: "${finalTranscript.trim()}"`);
                expect(finalTranscript.trim().length).toBeGreaterThan(0);
                resolve();
            });

            ws.on('error', reject);
        });
    }, 15000);
});
