import React from 'react';
import { FileText, Loader2 } from 'lucide-react';

interface CallSummaryProps {
    summary: string;
    isSummarizing: boolean;
    isCalling: boolean;
}

export const CallSummary: React.FC<CallSummaryProps> = ({ summary, isSummarizing, isCalling }) => {
    // Parse bullet lines from the summary string
    const bullets = summary
        .split('\n')
        .map(line => line.replace(/^[•\-]\s*/, '').trim())
        .filter(Boolean);

    const showSkeleton = isCalling && !summary && !isSummarizing;
    const isEmpty = !isCalling && !summary;

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden shrink-0">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <FileText size={16} className="text-indigo-600" />
                    <h2 className="font-bold text-slate-900 text-sm tracking-tight">Call Summary</h2>
                </div>
                {isSummarizing && (
                    <div className="flex items-center gap-1.5">
                        <Loader2 size={12} className="text-indigo-400 animate-spin" />
                        <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Updating</span>
                    </div>
                )}
                {!isSummarizing && summary && (
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Live</span>
                )}
            </div>

            <div className="px-5 py-4 space-y-2 max-h-52 overflow-y-auto custom-scroll">
                {isEmpty && (
                    <p className="text-xs text-slate-400 italic text-center py-2">
                        Summary will appear once a call is active.
                    </p>
                )}

                {showSkeleton && (
                    <div className="space-y-2 animate-pulse">
                        {[80, 65, 90, 55].map((w, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 mt-1.5 shrink-0" />
                                <div className={`h-3 bg-slate-100 rounded`} style={{ width: `${w}%` }} />
                            </div>
                        ))}
                    </div>
                )}

                {bullets.length > 0 && bullets.map((line, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                        <p className="text-xs text-slate-600 leading-relaxed">{line}</p>
                    </div>
                ))}

                {/* Refreshing overlay — show updated bullets but dim them while new summary loads */}
                {isSummarizing && bullets.length > 0 && (
                    <p className="text-[10px] text-slate-400 italic pt-1">Refreshing summary…</p>
                )}
            </div>
        </div>
    );
};
