import React from 'react';
import { Mic, PhoneOff, Activity, Terminal } from 'lucide-react';

interface ControlPanelProps {
    isCalling: boolean;
    socketConnected: boolean;
    onStartCall: () => void;
    onStopCall: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ isCalling, socketConnected, onStartCall, onStopCall }) => {
    return (
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
                        onClick={onStartCall}
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
                        onClick={onStopCall}
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
                        <span className={`text-xs ${socketConnected ? 'text-[var(--accent-live)]' : 'text-[var(--accent-alert)]'}`}>
                            {socketConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
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
    );
};
