import React, { useEffect, useRef } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, Info, Zap } from 'lucide-react';
import { Insight } from '../types';

interface IntelligenceStreamProps {
    insights: Insight[];
    isCalling: boolean;
}

export const IntelligenceStream: React.FC<IntelligenceStreamProps> = ({ insights, isCalling }) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [insights]);

    const getIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case 'action': return <Zap size={14} className="text-amber-500" />;
            case 'positive': return <CheckCircle2 size={14} className="text-emerald-500" />;
            case 'negative': return <AlertCircle size={14} className="text-rose-500" />;
            default: return <Info size={14} className="text-indigo-500" />;
        }
    };

    const getColors = (type: string) => {
        switch (type.toLowerCase()) {
            case 'action': return 'bg-amber-50 border-amber-100 text-amber-900';
            case 'positive': return 'bg-emerald-50 border-emerald-100 text-emerald-900';
            case 'negative': return 'bg-rose-50 border-rose-100 text-rose-900';
            default: return 'bg-indigo-50 border-indigo-100 text-indigo-900';
        }
    };

    return (
        <div className="flex flex-col h-full gap-4 min-h-0 bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-indigo-600" />
                    <h2 className="font-bold text-slate-900 text-sm tracking-tight uppercase">Intelligence Stream</h2>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Live Buffer</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">{insights.length}</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scroll">
                {insights.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 text-center px-8">
                        <Sparkles size={32} className="mb-4 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-800 uppercase tracking-widest">Awaiting Transmission</p>
                        <p className="text-xs text-slate-500 mt-2 italic">Connect via Comms Hub to begin real-time analysis.</p>
                    </div>
                ) : (
                    insights.map((insight, idx) => {
                        const type = (insight.type || insight.category || 'info').toLowerCase();
                        return (
                            <div
                                key={idx}
                                className={`p-4 rounded-xl border transition-all hover:shadow-sm ${getColors(type)}`}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    {getIcon(type)}
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                        {type}
                                    </span>
                                </div>
                                <p className="text-xs font-semibold leading-relaxed">
                                    {insight.content}
                                </p>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            <div className="h-8 flex items-center justify-center border-t border-slate-50 mt-2 shrink-0">
                <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className={`w-1 h-1 rounded-full ${isCalling ? 'bg-indigo-300 animate-bounce' : 'bg-slate-200'}`} style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                </div>
            </div>
        </div>
    );
};
