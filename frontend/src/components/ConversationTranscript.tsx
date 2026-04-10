import React, { useEffect, useRef } from 'react';
import { User, Bot, MessageSquareText } from 'lucide-react';
import { TranscriptChunk } from '../types';

interface ConversationTranscriptProps {
    transcripts: TranscriptChunk[];
    isCalling: boolean;
}

export const ConversationTranscript: React.FC<ConversationTranscriptProps> = ({ transcripts, isCalling }) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts]);

    return (
        <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <MessageSquareText size={18} className="text-indigo-600" />
                    <h2 className="font-bold text-slate-900 text-sm tracking-tight">Live Transcription</h2>
                </div>
                {isCalling && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-indigo-50 rounded-md border border-indigo-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Recording</span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll">
                {transcripts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                        <Bot size={40} className="mb-4 text-slate-200" />
                        <p className="text-sm font-medium text-slate-400 leading-loose">
                            Your conversation will appear here<br />
                            once a call begins.
                        </p>
                    </div>
                ) : (
                    transcripts.map((chunk, idx) => {
                        const isSimulated = chunk.speaker === 'Simulator';
                        // For live chunks: speakerIndex 1 aligns right, 0 aligns left
                        const isRight = isSimulated || chunk.speakerIndex === 1;

                        return (
                            <div
                                key={idx}
                                className={`flex gap-3 ${isRight ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}
                            >
                                {/* Left avatar — Speaker 0 or live user */}
                                {!isRight && (
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                                        <User size={16} className="text-slate-500" />
                                    </div>
                                )}

                                <div className={`max-w-[80%] flex flex-col ${isRight ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm border transition-opacity duration-200
                                        ${isSimulated
                                            ? 'bg-slate-900 text-white border-slate-800 rounded-tr-none'
                                            : isRight
                                                ? 'bg-indigo-50 text-indigo-900 border-indigo-100 rounded-tr-none'
                                                : 'bg-white text-slate-700 border-slate-100 rounded-tl-none'
                                        }
                                        ${chunk.partial ? 'opacity-60' : 'opacity-100'}`}
                                    >
                                        {chunk.transcript}
                                        {chunk.partial && (
                                            <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-current align-middle animate-pulse" />
                                        )}
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1.5 px-1">
                                        {new Date(chunk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        {isSimulated ? ' • Practice' : isRight ? ' • Speaker B' : ' • Speaker A'}
                                    </span>
                                </div>

                                {/* Right avatar — Speaker 1 or simulator */}
                                {isRight && (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border
                                        ${isSimulated
                                            ? 'bg-indigo-600 border-indigo-500 shadow-md shadow-indigo-100'
                                            : 'bg-indigo-100 border-indigo-200'
                                        }`}
                                    >
                                        {isSimulated
                                            ? <Bot size={16} className="text-white" />
                                            : <User size={16} className="text-indigo-500" />
                                        }
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};
