import React from 'react';
import { FileText, Loader2 } from 'lucide-react';

interface CallSummaryProps {
    summary: string;
    isSummarizing: boolean;
    isCalling: boolean;
}

export const CallSummary: React.FC<CallSummaryProps> = ({ summary, isSummarizing, isCalling }) => {
    // Parse complete bullet lines; during streaming the last line may be incomplete
    const lines = summary.split('\n').filter(Boolean);
    const bullets = isSummarizing
        ? lines // show raw lines as they stream in (last may be partial)
        : lines.map(line => line.replace(/^[•\-]\s*/, '').trim()).filter(Boolean);

    // Show skeleton any time we're generating but have no content yet (during or after call)
    const showSkeleton = isSummarizing && !summary;
    // Only show the idle placeholder when truly inactive — not while a post-call summary is loading
    const isEmpty = !isCalling && !summary && !isSummarizing;

    return (
        <div className="h-full flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-2">
                    <FileText size={16} className="text-indigo-600" />
                    <h2 className="font-bold text-slate-900 text-sm tracking-tight">Call Summary</h2>
                </div>
                {isSummarizing && (
                    <div className="flex items-center gap-1.5">
                        <Loader2 size={12} className="text-indigo-400 animate-spin" />
                        <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">
                            {summary ? 'Updating' : 'Generating'}
                        </span>
                    </div>
                )}
                {!isSummarizing && summary && (
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Live</span>
                )}
            </div>

            <div className="flex-1 min-h-0 px-5 py-4 space-y-2 overflow-y-auto custom-scroll">
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

                {bullets.map((line, i) => {
                    const text = line.replace(/^[•\-]\s*/, '').trim();
                    const isLastStreaming = isSummarizing && i === bullets.length - 1;
                    return (
                        <div key={i} className="flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                            <p className="text-xs text-slate-600 leading-relaxed break-words min-w-0">
                                {text}
                                {isLastStreaming && (
                                    <span className="inline-block w-0.5 h-3 bg-indigo-400 ml-0.5 align-middle animate-cursor-blink" />
                                )}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
