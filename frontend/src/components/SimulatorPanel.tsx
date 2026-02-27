import React, { useState } from 'react';
import { Play, Loader2, Bot } from 'lucide-react';

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
        <div className="bg-[var(--bg-panel)] border border-[var(--border-industrial)] p-4 flex flex-col shrink-0">
            <div className="flex items-center gap-2 border-b border-[var(--border-industrial)] pb-2 mb-4">
                <Bot size={16} className="text-[var(--text-muted)]" />
                <h2 className="font-display font-bold uppercase text-[var(--text-muted)] text-sm tracking-widest">
                    AI Test Simulator
                </h2>
            </div>

            <textarea
                className="w-full bg-[var(--bg-base)] border border-[var(--border-industrial)] text-[var(--text-primary)] p-3 text-xs font-mono h-32 resize-none focus:outline-none focus:border-[var(--border-light)] transition-colors mb-4"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Enter simulation transcript..."
                disabled={isSimulating}
            />

            <button
                onClick={handleRunSimulation}
                disabled={isSimulating || !script.trim()}
                className="w-full bg-[var(--bg-panel-hover)] hover:bg-[var(--border-industrial)] border border-[var(--border-light)] hover:border-[var(--accent-info)] disabled:opacity-50 disabled:hover:border-[var(--border-light)] text-[var(--text-primary)] transition-colors py-3 px-4 flex items-center justify-between group"
            >
                <div className="flex items-center gap-3">
                    {isSimulating ? (
                        <Loader2 size={18} className="animate-spin text-[var(--accent-info)]" />
                    ) : (
                        <Play size={18} className="text-[var(--text-muted)] group-hover:text-[var(--accent-info)]" />
                    )}
                    <span className="font-display font-bold uppercase tracking-wider text-sm">
                        {isSimulating ? 'Simulating...' : 'Run Simulation'}
                    </span>
                </div>
                <span className="text-[var(--text-muted)] text-xs group-hover:text-[var(--accent-info)] font-bold">
                    {isSimulating ? 'EXEC' : 'TEST'}
                </span>
            </button>
        </div>
    );
};
