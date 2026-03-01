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
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
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

    const _startRecordingStream = useCallback((stream: MediaStream) => {
        // Generate a fresh UUID for every new call
        const newSessionId = generateUUID();
        sessionIdRef.current = newSessionId;
        setSessionId(newSessionId);

        setIsCalling(true);
        if (socketRef.current) {
            socketRef.current.emit('start-call', { sessionId: newSessionId, title: 'New Sales Call' });
        }

        try {
            const options = { mimeType: 'audio/webm; codecs=opus' };
            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socketRef.current) {
                    socketRef.current.emit('audio-chunk', {
                        sessionId: sessionIdRef.current,  // FIX 1: use ref, not stale state
                        chunk: event.data
                    });
                }
            };

            mediaRecorder.start(500);
        } catch (err) {
            console.error('Error starting media recorder:', err);
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
                // FIX 3: capture stream BEFORE play so recordings have live tracks from the start
                const stream = captureStream.call(audioEl);
                _startRecordingStream(stream);
                // Small delay to ensure recorder has attached before first audio data arrives
                await new Promise<void>(resolve => setTimeout(resolve, 50));
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

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
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
