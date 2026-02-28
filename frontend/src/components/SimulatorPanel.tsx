import React, { useState } from 'react';
import { Play, Loader2, Cpu, MessageSquare } from 'lucide-react';

interface SimulatorPanelProps {
    onSimulate: (text: string) => Promise<void>;
    isSimulating: boolean;
}

export const SimulatorPanel: React.FC<SimulatorPanelProps> = ({ onSimulate, isSimulating }) => {
    const [script, setScript] = useState(
        "Hi, this is a simulated test of the Wingman system. I am calling to discuss buying 500 licenses for my team. Can we negotiate a price?"
    );

    const handleRunSimulation = async () => {
        if (!script.trim()) return;
        await onSimulate(script);
    };

    return (
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Cpu size={16} className="text-indigo-500" />
                <h2 className="font-bold uppercase text-slate-900 text-[11px] tracking-widest">
                    Practice Mode
                </h2>
            </div>

            <div className="relative group">
                <div className="absolute left-3 top-3 pointer-events-none">
                    <MessageSquare size={14} className="text-slate-300 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <textarea
                    className="w-full bg-slate-50 border border-slate-100 text-slate-700 p-3 pl-9 text-xs font-medium h-32 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all mb-4 leading-relaxed"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Type a practice conversation script..."
                    disabled={isSimulating}
                />
            </div>

            <button
                onClick={handleRunSimulation}
                disabled={isSimulating || !script.trim()}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3 px-4 flex items-center justify-between group transition-all active:scale-[0.98] disabled:opacity-50"
            >
                <div className="flex items-center gap-3">
                    {isSimulating ? (
                        <Loader2 size={16} className="animate-spin text-indigo-400" />
                    ) : (
                        <Play size={16} className="text-slate-400 group-hover:text-white transition-colors" />
                    )}
                    <span className="font-bold text-xs uppercase tracking-wider">
                        {isSimulating ? 'Running...' : 'Run Practice Call'}
                    </span>
                </div>
                <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                    <span className="w-1 h-3 bg-indigo-500 rounded-full" />
                    <span className="w-1 h-3 bg-indigo-400 rounded-full" />
                    <span className="w-1 h-3 bg-indigo-300 rounded-full" />
                </div>
            </button>
            <p className="mt-3 text-[9px] text-slate-400 font-medium tracking-tight text-center">
                Converts text to speech and runs through the full AI pipeline
            </p>
        </div>
    );
};
