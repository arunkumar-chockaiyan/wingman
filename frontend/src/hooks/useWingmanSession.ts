import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Insight, TranscriptChunk } from '../types';

const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const useWingmanSession = () => {
    const [isCalling, setIsCalling] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [insights, setInsights] = useState<Insight[]>([]);
    const [transcripts, setTranscripts] = useState<TranscriptChunk[]>([]);
    const [socketConnected, setSocketConnected] = useState(false);

    const sessionIdRef = useRef<string>('');
    const [sessionId, setSessionId] = useState<string>('');

    const socketRef = useRef<Socket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

    const isSimulatingRef = useRef(false);

    useEffect(() => {
        isSimulatingRef.current = isSimulating;
    }, [isSimulating]);

    useEffect(() => {
        const socket = io('http://localhost:3001');
        socketRef.current = socket;

        socket.on('insight', (insight: Insight) => {
            setInsights((prev) => [...prev, insight]);
        });

        socket.on('transcript', (data: TranscriptChunk) => {
            const enrichedData = {
                ...data,
                speaker: isSimulatingRef.current ? 'Simulator' : 'User'
            };
            setTranscripts((prev) => [...prev, enrichedData]);
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            setSocketConnected(true);
            // Do NOT auto-start a session on reconnect — wait for explicit startCall
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            setSocketConnected(false);
        });

        return () => {
            socket.disconnect();
            if (audioPlayerRef.current) {
                audioPlayerRef.current.pause();
            }
        };
    }, [sessionId]);

    const _startRecordingStream = useCallback(async (stream: MediaStream) => {
        // Generate a fresh UUID for every new call
        const newSessionId = generateUUID();
        sessionIdRef.current = newSessionId;
        setSessionId(newSessionId);

        setIsCalling(true);
        if (socketRef.current) {
            socketRef.current.emit('start-call', { sessionId: newSessionId, title: 'New Sales Call' });
        }

        try {
            // Ensure we don't duplicate
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                return;
            }

            // Create AudioContext specifically at 16kHz for Vosk
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const context = new AudioContextClass({ sampleRate: 16000 });
            audioContextRef.current = context;

            const source = context.createMediaStreamSource(stream);

            // Load the worklet processor from the public folder
            await context.audioWorklet.addModule('/pcm-processor.js');

            const workletNode = new AudioWorkletNode(context, 'pcm-processor');
            audioWorkletNodeRef.current = workletNode;

            workletNode.port.onmessage = (event) => {
                if (!socketRef.current) return;

                // Node Socket.IO expects Buffer, which from client is sent as ArrayBuffer
                socketRef.current.emit('audio-chunk', {
                    sessionId: sessionIdRef.current,
                    chunk: event.data
                });
            };

            // Connect source -> worklet -> muted gain -> destination
            const gainNode = context.createGain();
            gainNode.gain.value = 0;
            source.connect(workletNode);
            workletNode.connect(gainNode);
            gainNode.connect(context.destination);
        } catch (err) {
            console.error('Error starting audio processor:', err);
            setIsCalling(false);
            setIsSimulating(false);
        }
    }, []);  // FIX 2: no state deps — all values accessed via refs

    const startCall = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            _startRecordingStream(stream);
        } catch (err) {
            console.error('Error accessing microphone:', err);
        }
    }, [_startRecordingStream]);

    const startSimulation = useCallback(async (text: string) => {
        if (isCalling) return; // Prevent double logging
        setIsSimulating(true);
        setInsights([]); // Clear old insights on new sim

        try {
            const res = await fetch('http://localhost:3001/api/simulate-tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (!res.ok) throw new Error("TTS generation failed");

            const data = await res.json();

            // Reconstruct the audio chunks into a playable blob
            // The google-tts-api base64 encoded mp3
            let blobData = new Uint8Array(0);
            for (const chunk of data.audioChunks) {
                const binaryString = window.atob(chunk.shortText ? chunk.base64 : chunk.base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const newBlobData = new Uint8Array(blobData.length + bytes.length);
                newBlobData.set(blobData);
                newBlobData.set(bytes, blobData.length);
                blobData = newBlobData;
            }

            const audioBlob = new Blob([blobData], { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);

            const audioEl = new Audio(audioUrl);
            audioEl.crossOrigin = 'anonymous';
            audioPlayerRef.current = audioEl;

            // Stop simulation when audio ends
            audioEl.onended = () => {
                stopCall();
            };

            // Capture the MediaStream from the Audio tag
            // Explicit generic cast to bypass strict TS lib dom limits for this bleeding edge API
            const captureStream = (audioEl as any).captureStream || (audioEl as any).mozCaptureStream;

            if (captureStream) {
                const stream = captureStream.call(audioEl);

                // Instead of starting synchronously, we wait for the audio to actually start playing
                // to guarantee that the stream has active tracks.
                audioEl.onplay = () => {
                    _startRecordingStream(stream);
                };

                await audioEl.play();
            } else {
                console.error("captureStream API not supported in this browser.");
                setIsSimulating(false);
            }
        } catch (error) {
            console.error("Simulation error", error);
            setIsSimulating(false);
        }
    }, [isCalling, _startRecordingStream]);

    const stopCall = useCallback(() => {
        setIsCalling(false);
        setIsSimulating(false);

        if (audioWorkletNodeRef.current) {
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }

        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current.src = "";
        }

        if (socketRef.current) {
            socketRef.current.emit('end-call', { sessionId: sessionIdRef.current });
        }
    }, []);

    return {
        isCalling,
        isSimulating,
        sessionId,
        insights,
        transcripts,
        socketConnected,
        startCall,
        startSimulation,
        stopCall
    };
};
