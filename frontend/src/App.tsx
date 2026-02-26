import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, PhoneOff, MessageSquare } from 'lucide-react';

// Simple UUID generator fallback if uuid lib is not installed
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const App: React.FC = () => {
    const [isCalling, setIsCalling] = useState(false);
    const [sessionId, setSessionId] = useState<string>('');
    const [insights, setInsights] = useState<any[]>([]);
    const socketRef = useRef<any>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    useEffect(() => {
        // Persistent Session ID (Robust Session Management)
        let storedSessionId = localStorage.getItem('wingman_session_id');
        if (!storedSessionId) {
            storedSessionId = generateUUID();
            localStorage.setItem('wingman_session_id', storedSessionId);
        }
        setSessionId(storedSessionId);

        // Initialize Socket
        socketRef.current = io('http://localhost:3001');

        socketRef.current.on('insight', (insight: any) => {
            setInsights((prev) => [insight, ...prev]);
        });

        socketRef.current.on('connect', () => {
            console.log('Connected to server');
            // If we were in a call, we should rejoin the room
            if (storedSessionId) {
                socketRef.current.emit('start-call', { sessionId: storedSessionId, title: 'Resumed Session' });
            }
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    const startCall = async () => {
        setIsCalling(true);
        socketRef.current.emit('start-call', { sessionId, title: 'New Sales Call' });

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Bandwidth Optimization: Use Opus if supported
            const options = { mimeType: 'audio/webm; codecs=opus' };
            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socketRef.current) {
                    // Send chunk with Session ID for routing
                    socketRef.current.emit('audio-chunk', {
                        sessionId,
                        chunk: event.data
                    });
                }
            };

            // Send smaller chunks every 500ms for responsiveness
            mediaRecorder.start(500);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setIsCalling(false);
        }
    };

    const stopCall = () => {
        setIsCalling(false);
        mediaRecorderRef.current?.stop();
        socketRef.current.emit('end-call', { sessionId });
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white p-8 font-sans">
            <header className="flex justify-between items-center mb-12">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                    Wingman AI
                </h1>
                <div className="text-slate-400 text-sm">
                    Session: <span className="font-mono">{sessionId.slice(0, 8)}...</span>
                </div>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Control Panel */}
                <div className="lg:col-span-1 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <Mic className="text-blue-400" /> Live Control
                    </h2>

                    {!isCalling ? (
                        <button
                            onClick={startCall}
                            className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                        >
                            <Mic size={20} /> Start Sales Call
                        </button>
                    ) : (
                        <button
                            onClick={stopCall}
                            className="w-full bg-red-600 hover:bg-red-500 transition-colors py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
                        >
                            <PhoneOff size={20} /> End Call
                        </button>
                    )}

                    <div className="mt-8">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Status</h3>
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${isCalling ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                            <span className="text-slate-300">{isCalling ? 'Recording & Streaming (Opus)' : 'Idle'}</span>
                        </div>
                    </div>
                </div>

                {/* Insights Stream */}
                <div className="lg:col-span-2 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl min-h-[500px]">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <MessageSquare className="text-emerald-400" /> Real-Time Insights
                    </h2>

                    <div className="space-y-4">
                        {insights.length === 0 && (
                            <p className="text-slate-500 text-center mt-12 italic">Waiting for call insights...</p>
                        )}
                        {insights.map((insight, idx) => (
                            <div key={insight.id || idx} className="bg-slate-700/50 p-4 rounded-xl border-l-4 border-emerald-500 animate-in fade-in slide-in-from-right duration-500">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-bold uppercase tracking-tighter text-emerald-400">{insight.category}</span>
                                    <span className="text-xs text-slate-500">{new Date().toLocaleTimeString()}</span>
                                </div>
                                <p className="text-slate-100">{insight.content}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
