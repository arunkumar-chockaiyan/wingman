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
                        return (
                            <div key={idx} className={`flex gap-4 ${isSimulated ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                                {!isSimulated && (
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                                        <User size={16} className="text-slate-500" />
                                    </div>
                                )}

                                <div className={`max-w-[80%] flex flex-col ${isSimulated ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm border ${isSimulated
                                        ? 'bg-slate-900 text-white border-slate-800 rounded-tr-none'
                                        : 'bg-white text-slate-700 border-slate-100 rounded-tl-none'
                                        }`}>
                                        {chunk.transcript}
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1.5 px-1">
                                        {new Date(chunk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        {isSimulated ? ' • Practice' : ' • Live'}
                                    </span>
                                </div>

                                {isSimulated && (
                                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 border border-indigo-500 shadow-md shadow-indigo-100">
                                        <Bot size={16} className="text-white" />
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
