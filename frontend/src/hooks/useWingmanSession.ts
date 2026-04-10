import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Insight, TranscriptChunk } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateUUID = (): string =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });

/**
 * Prepare a pasted transcript for TTS playback:
 * - Speaker labels (e.g. "John:", "Sales Rep:") at the start of a line are removed and
 *   replaced with a short pause so the voice doesn't read them aloud.
 * - Line breaks are also converted to pauses.
 * A period+space is used as the pause marker because Google TTS splits on sentence
 * boundaries, producing a natural breath between utterances.
 */
function preprocessTranscriptForTTS(text: string): string {
    return text
        .replace(/^[\w][\w ]{0,30}:\s*/gm, '. ')   // speaker labels at line start
        .replace(/\n+/g, '. ')                        // line breaks → pause
        .replace(/(\.\s*){2,}/g, '. ')                // collapse consecutive pause markers
        .trim();
}

/** Fetch TTS audio from the backend and return a playable Blob. */
async function fetchTTSAudio(text: string): Promise<Blob> {
    const res = await fetch(`${BACKEND_URL}/api/simulate-tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('TTS generation failed');

    const { audioChunks } = await res.json();

    // Collect all decoded chunks first, then merge in a single pass (O(n) instead of O(n²))
    const decoded: Uint8Array[] = audioChunks.map((chunk: { base64: string }) => {
        const binaryString = window.atob(chunk.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    });

    const totalLength = decoded.reduce((sum, b) => sum + b.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const bytes of decoded) {
        merged.set(bytes, offset);
        offset += bytes.length;
    }

    return new Blob([merged], { type: 'audio/mp3' });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const SUMMARY_EVERY_N_UTTERANCES = 5;

export const useWingmanSession = () => {
    const [isCalling, setIsCalling] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [insights, setInsights] = useState<Insight[]>([]);
    const [transcripts, setTranscripts] = useState<TranscriptChunk[]>([]);
    const [summary, setSummary] = useState<string>('');
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [socketConnected, setSocketConnected] = useState(false);

    const sessionIdRef = useRef<string>('');
    const [sessionId, setSessionId] = useState<string>('');

    const socketRef = useRef<Socket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

    const isSimulatingRef = useRef(false);
    useEffect(() => { isSimulatingRef.current = isSimulating; }, [isSimulating]);

    const finalCountRef = useRef<number>(0);
    const transcriptsRef = useRef<TranscriptChunk[]>([]);
    useEffect(() => { transcriptsRef.current = transcripts; }, [transcripts]);

    const fetchSummary = useCallback(async () => {
        const text = transcriptsRef.current
            .filter(t => !t.partial)
            .map(t => t.transcript)
            .join(' ')
            .trim();
        if (!text) return;

        setIsSummarizing(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript: text }),
            });
            if (res.ok) {
                const { summary } = await res.json();
                setSummary(summary ?? '');
            }
        } catch (err) {
            console.error('[fetchSummary] failed:', err);
        } finally {
            setIsSummarizing(false);
        }
    }, []);

    // VAD heuristic: gap > threshold between finals → assume speaker changed
    const SPEAKER_CHANGE_GAP_MS = 1500;
    const lastFinalTimestampRef = useRef<number>(0);
    const currentSpeakerIdxRef = useRef<number>(0);
    // Speaker index locked in when a new utterance starts, kept stable through partial updates
    const utteranceSpeakerIdxRef = useRef<number>(0);

    // -------------------------------------------------------------------
    // Socket lifecycle — connect once, never reconnect on state changes
    // -------------------------------------------------------------------

    useEffect(() => {
        const socket = io(BACKEND_URL);
        socketRef.current = socket;

        socket.on('connect', () => setSocketConnected(true));
        socket.on('disconnect', () => setSocketConnected(false));

        socket.on('insight', (insight: Insight) => {
            setInsights((prev) => [...prev, insight]);
        });

        socket.on('partial-transcript', (data: { transcript: string; timestamp: number }) => {
            setTranscripts((prev) => {
                const isNewUtterance = prev.length === 0 || !prev[prev.length - 1].partial;

                if (isNewUtterance && !isSimulatingRef.current) {
                    // Detect speaker change: significant gap since last final → toggle side
                    const gap = Date.now() - lastFinalTimestampRef.current;
                    if (lastFinalTimestampRef.current > 0 && gap > SPEAKER_CHANGE_GAP_MS) {
                        currentSpeakerIdxRef.current = 1 - currentSpeakerIdxRef.current;
                    }
                    utteranceSpeakerIdxRef.current = currentSpeakerIdxRef.current;
                }

                const chunk: TranscriptChunk = {
                    ...data,
                    partial: true,
                    speaker: isSimulatingRef.current ? 'Simulator' : 'User',
                    speakerIndex: isSimulatingRef.current ? undefined : utteranceSpeakerIdxRef.current,
                };

                if (!isNewUtterance) {
                    return [...prev.slice(0, -1), chunk];
                }
                return [...prev, chunk];
            });
        });

        socket.on('transcript', (data: TranscriptChunk) => {
            setTranscripts((prev) => {
                const prevIsPartial = prev.length > 0 && prev[prev.length - 1].partial;

                if (!isSimulatingRef.current) {
                    if (!prevIsPartial) {
                        // Final arrived with no preceding partial (short utterance) — detect speaker change now
                        const gap = Date.now() - lastFinalTimestampRef.current;
                        if (lastFinalTimestampRef.current > 0 && gap > SPEAKER_CHANGE_GAP_MS) {
                            currentSpeakerIdxRef.current = 1 - currentSpeakerIdxRef.current;
                        }
                        utteranceSpeakerIdxRef.current = currentSpeakerIdxRef.current;
                    }
                    lastFinalTimestampRef.current = Date.now();
                }

                // Trigger a summary refresh every N final utterances
                finalCountRef.current += 1;
                if (finalCountRef.current % SUMMARY_EVERY_N_UTTERANCES === 0) {
                    fetchSummary();
                }

                const chunk: TranscriptChunk = {
                    ...data,
                    partial: false,
                    speaker: isSimulatingRef.current ? 'Simulator' : 'User',
                    speakerIndex: isSimulatingRef.current ? undefined : utteranceSpeakerIdxRef.current,
                };

                if (prevIsPartial) {
                    return [...prev.slice(0, -1), chunk];
                }
                return [...prev, chunk];
            });
        });

        // Reset call state on server-side errors so the UI doesn't get stuck
        socket.on('error', (err: { message: string }) => {
            console.error('[Socket] Server error:', err.message);
            setIsCalling(false);
            setIsSimulating(false);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    // -------------------------------------------------------------------
    // Core: initialize audio pipeline (shared by startCall & simulation)
    // -------------------------------------------------------------------

    const initializeAudioPipeline = useCallback(
        async (stream: MediaStream, muteOutput: boolean): Promise<void> => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                return;
            }

            const Ctor = window.AudioContext || (window as any).webkitAudioContext;
            // Use the browser's native sample rate — pcm-processor.js downsamples to 16kHz
            const context = new Ctor();
            audioContextRef.current = context;

            const source = context.createMediaStreamSource(stream);

            try {
                await context.audioWorklet.addModule('/pcm-processor.js');
            } catch (err) {
                console.error('[AudioPipeline] Failed to load audio worklet:', err);
                context.close();
                audioContextRef.current = null;
                throw new Error('Audio worklet unavailable — ensure /pcm-processor.js is served correctly');
            }

            const workletNode = new AudioWorkletNode(context, 'pcm-processor');
            audioWorkletNodeRef.current = workletNode;

            let chunkCount = 0;
            workletNode.port.onmessage = (event) => {
                chunkCount++;
                socketRef.current?.emit('audio-chunk', {
                    sessionId: sessionIdRef.current,
                    chunk: event.data,
                });
            };

            const gainNode = context.createGain();
            gainNode.gain.value = muteOutput ? 0 : 1;
            source.connect(workletNode);
            workletNode.connect(gainNode);
            gainNode.connect(context.destination);
        },
        [],
    );

    // -------------------------------------------------------------------
    // Core: begin a new session (generate ID, emit start-call)
    // -------------------------------------------------------------------

    const beginSession = useCallback((title: string): string => {
        const id = generateUUID();
        sessionIdRef.current = id;
        setSessionId(id);
        setIsCalling(true);
        socketRef.current?.emit('start-call', { sessionId: id, title });
        return id;
    }, []);

    // -------------------------------------------------------------------
    // Core: tear down all audio resources
    // -------------------------------------------------------------------

    const teardownAudio = useCallback(() => {
        if (audioWorkletNodeRef.current) {
            // Flush any remaining samples in the worklet buffer before disconnecting
            audioWorkletNodeRef.current.port.postMessage('flush');
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch((err) =>
                console.error('[teardownAudio] Failed to close AudioContext:', err)
            );
            audioContextRef.current = null;
        }
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current.src = '';
            audioPlayerRef.current = null;
        }
    }, []);

    // -------------------------------------------------------------------
    // stopCall
    // -------------------------------------------------------------------

    const stopCall = useCallback(() => {
        setIsCalling(false);
        setIsSimulating(false);
        setSummary('');
        finalCountRef.current = 0;
        teardownAudio();
        socketRef.current?.emit('end-call', { sessionId: sessionIdRef.current });
    }, [teardownAudio]);

    // Use a ref so inner closures (e.g. audioEl.onended) always call the latest version
    const stopCallRef = useRef(stopCall);
    useEffect(() => { stopCallRef.current = stopCall; }, [stopCall]);

    // -------------------------------------------------------------------
    // startCall (live microphone)
    // -------------------------------------------------------------------

    const startCall = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            beginSession('New Sales Call');
            await initializeAudioPipeline(stream, true);
        } catch (err) {
            console.error('[startCall] Error accessing microphone:', err);
            setIsCalling(false);
        }
    }, [beginSession, initializeAudioPipeline]);

    // -------------------------------------------------------------------
    // startSimulation (replay transcript via TTS → captureStream)
    // -------------------------------------------------------------------

    const startSimulation = useCallback(async (text: string) => {
        if (isCalling) return;
        setIsSimulating(true);
        setInsights([]);

        try {
            // 1. Fetch TTS audio (preprocess to turn labels/line-breaks into pauses)
            const audioBlob = await fetchTTSAudio(preprocessTranscriptForTTS(text));
            const audioUrl = URL.createObjectURL(audioBlob);

            // 2. Create audio element (don't play yet)
            const audioEl = new Audio(audioUrl);
            audioEl.crossOrigin = 'anonymous';
            audioPlayerRef.current = audioEl;

            // 3. Get captureStream
            const captureStreamFn =
                (audioEl as any).captureStream || (audioEl as any).mozCaptureStream;

            if (!captureStreamFn) {
                console.error('[startSimulation] captureStream API not supported in this browser.');
                setIsSimulating(false);
                return;
            }

            // 4. Begin session (generates UUID, emits start-call)
            beginSession('Replay Simulation');

            // 5. PRE-INITIALIZE AudioContext + worklet BEFORE playing audio.
            //    addModule() is async (~200ms); playing first would lose early audio frames.
            const Ctor = window.AudioContext || (window as any).webkitAudioContext;
            const context = new Ctor();
            audioContextRef.current = context;

            try {
                await context.audioWorklet.addModule('/pcm-processor.js');
            } catch (err) {
                console.error('[startSimulation] Failed to load audio worklet:', err);
                context.close();
                audioContextRef.current = null;
                setIsSimulating(false);
                return;
            }

            const workletNode = new AudioWorkletNode(context, 'pcm-processor');
            audioWorkletNodeRef.current = workletNode;

            workletNode.port.onmessage = (event) => {
                socketRef.current?.emit('audio-chunk', {
                    sessionId: sessionIdRef.current,
                    chunk: event.data,
                });
            };

            // 6. Get the capture stream and connect the audio graph synchronously
            const stream: MediaStream = captureStreamFn.call(audioEl);

            audioEl.onended = () => {
                stopCallRef.current();
            };

            // 7. Start playback FIRST so the stream gets active tracks
            await audioEl.play();

            // 8. Connect the stream source to the worklet graph immediately
            //    (all synchronous — no await gap where audio can be lost)
            const source = context.createMediaStreamSource(stream);
            const gainNode = context.createGain();
            gainNode.gain.value = 1; // Let simulation audio play through speakers
            source.connect(workletNode);
            workletNode.connect(gainNode);
            gainNode.connect(context.destination);

        } catch (error) {
            console.error('[startSimulation] Error:', error);
            setIsSimulating(false);
        }
    }, [isCalling, beginSession]);

    // -------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------

    return {
        isCalling,
        isSimulating,
        sessionId,
        insights,
        transcripts,
        summary,
        isSummarizing,
        socketConnected,
        startCall,
        startSimulation,
        stopCall,
    };
};
