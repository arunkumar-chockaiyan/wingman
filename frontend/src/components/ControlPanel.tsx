import React from 'react';
import { Mic, PhoneOff, Signal } from 'lucide-react';

interface ControlPanelProps {
    isCalling: boolean;
    socketConnected: boolean;
    onStartCall: () => void;
    onStopCall: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
    isCalling,
    socketConnected,
    onStartCall,
    onStopCall
}) => {
    return (
        <div className="flex flex-col gap-4">
            {/* Control Block */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-5">
                    <Signal size={16} className="text-indigo-500" />
                    <h2 className="font-bold uppercase text-slate-900 text-[11px] tracking-widest">
                        Simulate a Sales Conversation
                    </h2>
                </div>

                {!isCalling ? (
                    <button
                        onClick={onStartCall}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-4 px-4 flex items-center justify-between group transition-all shadow-lg shadow-indigo-100 active:scale-[0.98]"
                    >
                        <div className="flex items-center gap-3">
                            <Mic size={18} />
                            <span className="font-bold text-sm">Start Call</span>
                        </div>
                        <span className="bg-indigo-500/20 px-2 py-0.5 rounded text-[10px] font-black tracking-tighter">GO</span>
                    </button>
                ) : (
                    <button
                        onClick={onStopCall}
                        className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-xl py-4 px-4 flex items-center justify-between group transition-all shadow-lg shadow-rose-100 active:scale-[0.98]"
                    >
                        <div className="flex items-center gap-3">
                            <PhoneOff size={18} />
                            <span className="font-bold text-sm">End Call</span>
                        </div>
                        <span className="bg-rose-400/20 px-2 py-0.5 rounded text-[10px] font-black tracking-tighter">STOP</span>
                    </button>
                )}

                <div className="mt-6 space-y-3">
                    <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">Microphone</span>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isCalling ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                            <span className={`font-bold ${isCalling ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {isCalling ? 'Active' : 'Off'}
                            </span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">Connection</span>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className={`font-bold ${socketConnected ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {socketConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
