import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Mic, PhoneOff, Activity, Terminal } from 'lucide-react';

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
    const insightsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let storedSessionId = localStorage.getItem('wingman_session_id');
        if (!storedSessionId) {
            storedSessionId = generateUUID();
            localStorage.setItem('wingman_session_id', storedSessionId);
        }
        setSessionId(storedSessionId);

        socketRef.current = io('http://localhost:3001');

        socketRef.current.on('insight', (insight: any) => {
            setInsights((prev) => [...prev, insight]);
        });

        socketRef.current.on('connect', () => {
            console.log('Connected to server');
            if (storedSessionId) {
                socketRef.current.emit('start-call', { sessionId: storedSessionId, title: 'Resumed Session' });
            }
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    useEffect(() => {
        insightsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [insights]);

    const startCall = async () => {
        setIsCalling(true);
        socketRef.current.emit('start-call', { sessionId, title: 'New Sales Call' });

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const options = { mimeType: 'audio/webm; codecs=opus' };
            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socketRef.current) {
                    socketRef.current.emit('audio-chunk', {
                        sessionId,
                        chunk: event.data
                    });
                }
            };

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

    const getInsightColor = (category: string) => {
        if (category.toLowerCase().includes('sales')) return 'text-[var(--accent-warning)] border-[var(--accent-warning)]';
        if (category.toLowerCase().includes('news')) return 'text-[var(--accent-info)] border-[var(--accent-info)]';
        return 'text-[var(--accent-live)] border-[var(--accent-live)]';
    };

    return (
        <div className="min-h-screen p-4 md:p-8 flex flex-col h-screen">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-[var(--border-industrial)] pb-4 shrink-0">
                <div>
                    <h1 className="text-4xl font-display font-bold text-[var(--text-primary)] tracking-tight uppercase flex items-center gap-1">
                        WINGMAN<span className="text-[var(--accent-live)]">_</span>SYS
                    </h1>
                    <p className="text-[var(--text-muted)] text-sm uppercase tracking-widest mt-1 hidden md:block">
                        Real-Time Intelligence HUD // v1.0.4
                    </p>
                </div>
                <div className="text-[var(--text-muted)] text-xs md:text-sm text-right mt-4 md:mt-0 flex flex-col items-end">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="uppercase tracking-widest text-[10px] text-[var(--border-light)]">Session ID</span>
                        <span className="bg-[var(--bg-panel)] px-2 py-1 border border-[var(--border-industrial)]">
                            {sessionId.slice(0, 8)}{sessionId && <span className="animate-cursor-blink text-[var(--accent-live)]">_</span>}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="uppercase tracking-widest text-[10px] text-[var(--border-light)]">Status</span>
                        {isCalling ? (
                            <span className="text-[var(--bg-base)] bg-[var(--accent-live)] px-2 py-1 font-bold text-xs">
                                LIVE
                            </span>
                        ) : (
                            <span className="text-[var(--text-muted)] bg-[var(--bg-panel)] border border-[var(--border-industrial)] px-2 py-1 text-xs">
                                STANDBY
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 min-h-0 overflow-hidden">
                {/* Left Panel: Control & Telemetry */}
                <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
                    {/* Control Block */}
                    <div className="bg-[var(--bg-panel)] border border-[var(--border-industrial)] p-4 flex flex-col shrink-0">
                        <div className="flex items-center gap-2 border-b border-[var(--border-industrial)] pb-2 mb-4">
                            <Terminal size={16} className="text-[var(--text-muted)]" />
                            <h2 className="font-display font-bold uppercase text-[var(--text-muted)] text-sm tracking-widest">
                                Comms Link
                            </h2>
                        </div>

                        {!isCalling ? (
                            <button
                                onClick={startCall}
                                className="w-full bg-[var(--bg-panel-hover)] hover:bg-[var(--border-industrial)] border border-[var(--border-light)] hover:border-[var(--accent-live)] text-[var(--text-primary)] transition-colors py-4 px-4 flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <Mic size={18} className="text-[var(--text-muted)] group-hover:text-[var(--accent-live)]" />
                                    <span className="font-display font-bold uppercase tracking-wider text-sm">Initialize Sec-Link</span>
                                </div>
                                <span className="text-[var(--text-muted)] text-xs group-hover:text-[var(--accent-live)] font-bold">INIT</span>
                            </button>
                        ) : (
                            <button
                                onClick={stopCall}
                                className="w-full bg-[var(--accent-alert-dim)] hover:bg-[var(--accent-alert)] border border-[var(--accent-alert)] text-[var(--accent-alert)] hover:text-white transition-all py-4 px-4 flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <PhoneOff size={18} />
                                    <span className="font-display font-bold uppercase tracking-wider text-sm flex-1 text-left">Terminate Link</span>
                                </div>
                                <span className="font-bold text-[10px] border border-current px-1 hidden md:block uppercase tracking-widest">Halt</span>
                            </button>
                        )}

                        <div className="mt-6 flex flex-col gap-2">
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-industrial)] flex-1 pb-1 mr-2">Audio Stream</span>
                                <span className={`text-xs ${isCalling ? 'text-[var(--accent-live)]' : 'text-[var(--text-muted)]'}`}>
                                    {isCalling ? 'OPUS // 48KHz' : 'OFFLINE'}
                                </span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-industrial)] flex-1 pb-1 mr-2">Socket.IO</span>
                                <span className="text-xs text-[var(--accent-live)]">CONNECTED</span>
                            </div>
                        </div>
                    </div>

                    {/* Telemetry Mock Block */}
                    <div className="bg-[var(--bg-panel)] border border-[var(--border-industrial)] p-4 flex-1 hidden lg:flex flex-col min-h-0">
                        <div className="flex items-center gap-2 border-b border-[var(--border-industrial)] pb-2 mb-4 shrink-0">
                            <Activity size={16} className="text-[var(--text-muted)]" />
                            <h2 className="font-display font-bold uppercase text-[var(--text-muted)] text-sm tracking-widest">
                                Signal Analysis
                            </h2>
                        </div>
                        <div className="flex-1 flex flex-col justify-end text-[10px] text-[var(--text-muted)] opacity-50 space-y-1 overflow-hidden">
                            {isCalling ? (
                                <>
                                    <p>&gt; Audio input buffer active</p>
                                    <p>&gt; Streaming chunks (500ms)</p>
                                    <p>&gt; Awaiting VAD detection...</p>
                                    <p>&gt; Processing multi-agent pipeline</p>
                                </>
                            ) : (
                                <>
                                    <p>&gt; System ready.</p>
                                    <p>&gt; Awaiting initialization.</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Intelligence Stream */}
                <div className="lg:col-span-3 bg-[var(--bg-base)] border border-[var(--border-industrial)] flex flex-col h-full min-h-[400px]">
                    <div className="bg-[var(--bg-panel)] border-b border-[var(--border-industrial)] px-4 py-3 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 ${isCalling ? 'bg-[var(--accent-live)] animate-cursor-blink' : 'bg-[var(--border-light)]'} rounded-none`}></div>
                            <h2 className="font-display font-bold uppercase text-[var(--text-primary)] text-sm tracking-widest">
                                Intelligence Stream
                            </h2>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest border border-[var(--border-industrial)] px-2 py-1">
                            Live Log
                        </span>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-4">
                        {insights.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] opacity-50">
                                <p>[ SYS ] No insights generated.</p>
                                <p>[ SYS ] Initialize Sec-Link to begin processing.</p>
                            </div>
                        )}

                        {insights.map((insight, idx) => {
                            const colorClasses = getInsightColor(insight.category);
                            return (
                                <div key={insight.id || idx} className={`flex flex-col gap-1 group animate-in fade-in duration-300`}>
                                    <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                                        <span>[ {new Date().toLocaleTimeString('en-US', { hour12: false })} ]</span>
                                        <span className={`uppercase font-bold tracking-widest px-1 border border-transparent group-hover:border-current transition-colors ${colorClasses.split(' ')[0]}`}>
                                            {insight.category}
                                        </span>
                                    </div>
                                    <div className={`pl-4 border-l ${colorClasses.replace('text-', 'border-')} border-opacity-30 group-hover:border-opacity-100 transition-colors py-1`}>
                                        <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{insight.content}</p>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={insightsEndRef} />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;

