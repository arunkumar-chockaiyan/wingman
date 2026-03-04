import process from 'process';
import WebSocket from 'ws';
import https from 'https';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const VOSK_URL = process.env.VOSK_URL || 'ws://localhost:2700';
// URL to a sample 16kHz 16-bit mono PCM/WAV file from an open dataset
const SAMPLE_URL = 'https://raw.githubusercontent.com/alphacep/vosk-api/master/python/example/test.wav';

async function runTest() {
    console.log(`[Test] Connecting to Vosk at ${VOSK_URL}...`);
    const ws = new WebSocket(VOSK_URL);

    ws.on('open', () => {
        console.log('[Test] WebSocket Opened. Sending config...');
        // Send configuration
        ws.send(JSON.stringify({ config: { sample_rate: 16000 } }));

        console.log(`[Test] Downloading sample audio from ${SAMPLE_URL}...`);
        https.get(SAMPLE_URL, (res) => {
            if (res.statusCode !== 200) {
                console.error(`[Test] Failed to download test file: ${res.statusCode}`);
                ws.close();
                process.exit(1);
            }

            res.on('data', (chunk) => {
                // Stream chunks directly to Vosk
                // The first few chunks of a WAV file are the RIFF header, but Vosk handles WAV headers automatically.
                ws.send(chunk);
            });

            res.on('end', () => {
                console.log('[Test] Finished sending audio chunks. Sending EOF...');
                ws.send('{"eof" : 1}');
            });
        }).on('error', (err) => {
            console.error('[Test] Downlod error:', err);
            ws.close();
            process.exit(1);
        });
    });

    ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        if (response.text) {
            console.log('[Test] Final Transcript received:', response.text);
        } else if (response.partial) {
            console.log('[Test] Partial Transcript:', response.partial);
        }
    });

    ws.on('close', () => {
        console.log('[Test] WebSocket Closed.');
        process.exit(0);
    });

    ws.on('error', (err) => {
        console.error('[Test] WebSocket Error:', err);
        process.exit(1);
    });
}

runTest();
