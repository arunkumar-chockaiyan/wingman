import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Insight, TranscriptChunk } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';
const PCM_WORKLET_URL = '/pcm-processor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a new AudioContext at the browser's native sample rate.
 * The pcm-processor worklet handles downsampling to 16 kHz internally.
 */
function createNativeAudioContext(): AudioContext {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    return new Ctor();
}

/**
 * Load the PCM worklet and return a connected AudioWorkletNode.
 * Subscribes to the worklet's `postMessage` to emit chunks over Socket.IO.
 */
async function initWorkletNode(
    context: AudioContext,
    socket: Socket,
    sessionIdRef: React.MutableRefObject<string>,
): Promise<AudioWorkletNode> {
    await context.audioWorklet.addModule(PCM_WORKLET_URL);
    const workletNode = new AudioWorkletNode(context, 'pcm-processor');

    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        socket.emit('audio-chunk', {
            sessionId: sessionIdRef.current,
            chunk: event.data,
        });
    };

    return workletNode;
}

/**
 * Wire an AudioNode source through two parallel routes:
 *   1. source → gainNode → destination   (speaker playback)
 *   2. source → worklet  → dumpGain(0) → destination   (transcription)
 *
 * @param mutePlayback – set `true` during live mic calls to prevent feedback
 */
function connectAudioGraph(
    context: AudioContext,
    source: AudioNode,
    workletNode: AudioWorkletNode,
    mutePlayback: boolean,
): void {
    // Speaker path
    const speakerGain = context.createGain();
    speakerGain.gain.value = mutePlayback ? 0 : 1;
    source.connect(speakerGain);
    speakerGain.connect(context.destination);

    // Transcription path – the worklet must connect to *some* destination to stay alive
    const dumpGain = context.createGain();
    dumpGain.gain.value = 0;
    source.connect(workletNode);
    workletNode.connect(dumpGain);
    dumpGain.connect(context.destination);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useWingmanSession = () => {
    const [isCalling, setIsCalling] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [insights, setInsights] = useState<Insight[]>([]);
    const [transcripts, setTranscripts] = useState<TranscriptChunk[]>([]);
    const [socketConnected, setSocketConnected] = useState(false);
    const [sessionId, setSessionId] = useState('');

    const sessionIdRef = useRef('');
    const socketRef = useRef<Socket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);

    // Keep a synchronous ref so the transcript listener can label the speaker
    const isSimulatingRef = useRef(false);
    useEffect(() => { isSimulatingRef.current = isSimulating; }, [isSimulating]);

    // -------------------------------------------------------------------
    // Socket.IO lifecycle (connect once on mount)
    // -------------------------------------------------------------------

    useEffect(() => {
        const socket = io(BACKEND_URL);
        socketRef.current = socket;

        socket.on('connect', () => setSocketConnected(true));
        socket.on('disconnect', () => setSocketConnected(false));

        socket.on('insight', (insight: Insight) => {
            setInsights((prev) => [...prev, insight]);
        });

        socket.on('transcript', (data: TranscriptChunk) => {
            setTranscripts((prev) => [
                ...prev,
                { ...data, speaker: isSimulatingRef.current ? 'Simulator' : 'User' },
            ]);
        });

        return () => { socket.disconnect(); };
    }, []); // intentionally empty — one socket for the lifetime of the hook

    // -------------------------------------------------------------------
    // Shared: begin a session
    // -------------------------------------------------------------------

    const beginSession = useCallback((title: string) => {
        const id = crypto.randomUUID();
        sessionIdRef.current = id;
        setSessionId(id);
        setIsCalling(true);
        socketRef.current?.emit('start-call', { sessionId: id, title });
        return id;
    }, []);

    // -------------------------------------------------------------------
    // Shared: tear down audio resources
    // -------------------------------------------------------------------

    const teardownAudio = useCallback(() => {
        if (audioWorkletNodeRef.current) {
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
    }, []);

    // -------------------------------------------------------------------
    // stopCall
    // -------------------------------------------------------------------

    const stopCall = useCallback(() => {
        setIsCalling(false);
        setIsSimulating(false);
        teardownAudio();
        socketRef.current?.emit('end-call', { sessionId: sessionIdRef.current });
    }, [teardownAudio]);

    // -------------------------------------------------------------------
    // startCall (live microphone)
    // -------------------------------------------------------------------

    const startCall = useCallback(async () => {
        if (!socketRef.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Prevent duplicate AudioContexts
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') return;

            beginSession('New Sales Call');

            const context = createNativeAudioContext();
            audioContextRef.current = context;

            const source = context.createMediaStreamSource(stream);
            const workletNode = await initWorkletNode(context, socketRef.current, sessionIdRef);
            audioWorkletNodeRef.current = workletNode;

            connectAudioGraph(context, source, workletNode, /* mutePlayback */ true);

            if (context.state === 'suspended') await context.resume();
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setIsCalling(false);
        }
    }, [beginSession]);

    // -------------------------------------------------------------------
    // startSimulation (replay transcript via TTS)
    // -------------------------------------------------------------------

    const startSimulation = useCallback(async (text: string) => {
        if (isCalling || !socketRef.current) return;
        setIsSimulating(true);
        setInsights([]);

        try {
            // 1. Fetch TTS audio from backend
            const res = await fetch(`${BACKEND_URL}/api/simulate-tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (!res.ok) throw new Error('TTS generation failed');

            const { audioChunks } = await res.json();

            // 2. Stitch base64-encoded MP3 chunks into a single ArrayBuffer
            const parts: Uint8Array[] = audioChunks.map((chunk: { base64: string }) => {
                const binary = window.atob(chunk.base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                return bytes;
            });
            const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
            const merged = new Uint8Array(totalLength);
            let offset = 0;
            for (const part of parts) { merged.set(part, offset); offset += part.length; }

            // 3. Ensure previous AudioContext is closed
            teardownAudio();

            // 4. Set up session and AudioContext
            beginSession('Replay Simulation');

            const context = createNativeAudioContext();
            audioContextRef.current = context;

            // decodeAudioData requires an owned ArrayBuffer (slice avoids shared-memory issues)
            const audioBuffer = await context.decodeAudioData(merged.buffer.slice(0));

            const workletNode = await initWorkletNode(context, socketRef.current!, sessionIdRef);
            audioWorkletNodeRef.current = workletNode;

            // 5. Build audio graph: source → speakers + worklet
            const sourceNode = context.createBufferSource();
            sourceNode.buffer = audioBuffer;
            connectAudioGraph(context, sourceNode, workletNode, /* mutePlayback */ false);

            sourceNode.onended = () => stopCall();
            sourceNode.start(0);
        } catch (error) {
            console.error('Simulation error:', error);
            setIsSimulating(false);
        }
    }, [isCalling, beginSession, teardownAudio, stopCall]);

    // -------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------

    return {
        isCalling,
        isSimulating,
        sessionId,
        insights,
        transcripts,
        socketConnected,
        startCall,
        startSimulation,
        stopCall,
    };
};
