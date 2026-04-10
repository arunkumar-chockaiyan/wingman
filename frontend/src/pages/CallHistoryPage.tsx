import React, { useEffect, useState, useCallback } from 'react';
import {
    History, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown,
    Clock, FileText, StickyNote, Link2, Bot, Inbox, ArrowLeft,
} from 'lucide-react';
import { HistorySession, HistoryRecommendation } from '../types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(start: string, end: string | null) {
    if (!end) return 'In progress';
    const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const FEEDBACK_COLORS: Record<string, string> = {
    LIKED:    'text-emerald-600 bg-emerald-50  border-emerald-200',
    DISLIKED: 'text-rose-500    bg-rose-50     border-rose-200    opacity-60',
    NONE:     'text-slate-600   bg-slate-50    border-slate-200',
};

// ---------------------------------------------------------------------------
// Session detail panel
// ---------------------------------------------------------------------------

function SessionDetail({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
    const [session, setSession] = useState<HistorySession | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'liked'>('liked');

    useEffect(() => {
        setLoading(true);
        fetch(`${BACKEND_URL}/api/sessions/${sessionId}`)
            .then(r => r.json())
            .then(setSession)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [sessionId]);

    if (loading) return (
        <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="animate-pulse text-sm">Loading session…</div>
        </div>
    );
    if (!session) return (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Session not found.</div>
    );

    const recs = session.recommendations ?? [];
    const shown = filter === 'liked' ? recs.filter(r => r.feedbackStatus === 'LIKED') : recs;
    const likedCount = recs.filter(r => r.feedbackStatus === 'LIKED').length;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3 shrink-0">
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
                    <ArrowLeft size={16} />
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-slate-900 text-sm truncate">{session.title}</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        {formatDate(session.startTime)} · {formatTime(session.startTime)} · {formatDuration(session.startTime, session.endTime)}
                    </p>
                </div>
                <span className="shrink-0 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    {likedCount} follow-up{likedCount !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll">
                {/* Summary */}
                {session.summary && (
                    <section>
                        <div className="flex items-center gap-2 mb-3">
                            <FileText size={14} className="text-indigo-500" />
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Summary</h3>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-1.5">
                            {session.summary.split('\n').filter(Boolean).map((line, i) => (
                                <p key={i} className="text-xs text-indigo-900 leading-relaxed">
                                    {line.replace(/^[•\-]\s*/, '')}
                                </p>
                            ))}
                        </div>
                    </section>
                )}

                {/* Rep context */}
                {(session.repNotes || session.repLinks || session.repInstructions) && (
                    <section className="grid grid-cols-1 gap-3">
                        {session.repNotes && (
                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <StickyNote size={13} className="text-indigo-400" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Notes</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{session.repNotes}</p>
                            </div>
                        )}
                        {session.repLinks && (
                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Link2 size={13} className="text-indigo-400" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Links</span>
                                </div>
                                <div className="space-y-1">
                                    {session.repLinks.split('\n').filter(Boolean).map((link, i) => (
                                        <a key={i} href={link.trim()} target="_blank" rel="noreferrer"
                                            className="block text-xs text-indigo-600 hover:underline truncate">
                                            {link.trim()}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                        {session.repInstructions && (
                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Bot size={13} className="text-indigo-400" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AI Instructions</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{session.repInstructions}</p>
                            </div>
                        )}
                    </section>
                )}

                {/* Insights */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <ThumbsUp size={14} className="text-slate-500" />
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Insights</h3>
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">{recs.length}</span>
                        </div>
                        <div className="flex text-[10px] font-bold rounded-lg overflow-hidden border border-slate-200">
                            {(['liked', 'all'] as const).map(f => (
                                <button key={f} onClick={() => setFilter(f)}
                                    className={`px-3 py-1 uppercase tracking-wide transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                                    {f === 'liked' ? `Follow-ups (${likedCount})` : `All (${recs.length})`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {shown.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Inbox size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-xs">{filter === 'liked' ? 'No follow-ups marked yet.' : 'No insights recorded.'}</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {shown.map(rec => (
                                <InsightRow key={rec.id} rec={rec} />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function InsightRow({ rec }: { rec: HistoryRecommendation }) {
    const colorClass = FEEDBACK_COLORS[rec.feedbackStatus] ?? FEEDBACK_COLORS.NONE;
    return (
        <div className={`flex items-start gap-3 p-3 rounded-xl border text-xs leading-relaxed ${colorClass}`}>
            <span className="mt-0.5 shrink-0">
                {rec.feedbackStatus === 'LIKED'
                    ? <ThumbsUp size={12} className="text-emerald-600" />
                    : rec.feedbackStatus === 'DISLIKED'
                        ? <ThumbsDown size={12} className="text-rose-400" />
                        : <span className="w-3 h-3 block" />}
            </span>
            <div className="flex-1 min-w-0">
                <p className="font-semibold">{rec.content}</p>
                <p className="opacity-50 mt-0.5 text-[10px]">{rec.category} · {formatTime(rec.createdAt)}</p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Session list row
// ---------------------------------------------------------------------------

function SessionRow({ session, onClick }: { session: HistorySession; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full text-left p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm transition-all group"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">
                        {session.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                            <Clock size={10} />
                            {formatDate(session.startTime)} · {formatTime(session.startTime)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                            {formatDuration(session.startTime, session.endTime)}
                        </span>
                    </div>
                    {session.summary && (
                        <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                            {session.summary.split('\n').find(l => l.trim())?.replace(/^[•\-]\s*/, '')}
                        </p>
                    )}
                </div>
                <ChevronDown size={16} className="text-slate-300 group-hover:text-indigo-400 shrink-0 mt-1 transition-colors" />
            </div>
        </button>
    );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

interface CallHistoryPageProps {
    onClose: () => void;
}

export const CallHistoryPage: React.FC<CallHistoryPageProps> = ({ onClose }) => {
    const [sessions, setSessions] = useState<HistorySession[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${BACKEND_URL}/api/sessions`)
            .then(r => r.json())
            .then(setSessions)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Page header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <History size={16} className="text-indigo-600" />
                    <h2 className="font-bold text-slate-900 text-sm tracking-tight">Call History</h2>
                    {!loading && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">
                            {sessions.length}
                        </span>
                    )}
                </div>
                <button onClick={onClose}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors px-2 py-1 rounded-lg hover:bg-slate-100">
                    ✕ Close
                </button>
            </div>

            {selectedId ? (
                <SessionDetail sessionId={selectedId} onClose={() => setSelectedId(null)} />
            ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
                    {loading && (
                        <div className="space-y-3 animate-pulse">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="h-20 bg-slate-100 rounded-2xl" />
                            ))}
                        </div>
                    )}
                    {!loading && sessions.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-center">
                            <Inbox size={32} className="mb-3 opacity-40" />
                            <p className="text-sm font-semibold">No calls recorded yet</p>
                            <p className="text-xs mt-1">Start a call to see its history here.</p>
                        </div>
                    )}
                    {!loading && sessions.map(s => (
                        <SessionRow key={s.id} session={s} onClick={() => setSelectedId(s.id)} />
                    ))}
                </div>
            )}
        </div>
    );
};
