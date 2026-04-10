import React, { useState, useEffect, useRef } from 'react';
import { StickyNote, Link2, Bot, ExternalLink, AlertCircle, X, Plus } from 'lucide-react';

// Must match REP_CONTEXT_LIMITS in contextStore.ts
const LIMITS = { notes: 1000, links: 500, instructions: 500 } as const;
type FieldKey = keyof typeof LIMITS;

interface SalesRepPanelProps {
    onContextChange: (notes: string, links: string, instructions: string) => void;
}

interface StoredLink {
    raw: string;
    url: string;
    valid: boolean;
}

function parseLink(raw: string): StoredLink {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        const parsed = new URL(normalized);
        const validHost = parsed.hostname.includes('.') || parsed.hostname === 'localhost';
        return { raw, url: normalized, valid: validHost };
    } catch {
        return { raw, url: normalized, valid: false };
    }
}

export const SalesRepPanel: React.FC<SalesRepPanelProps> = ({ onContextChange }) => {
    const [notes, setNotes] = useState('');
    const [instructions, setInstructions] = useState('');
    const [links, setLinks] = useState<StoredLink[]>([]);
    const [linkInput, setLinkInput] = useState('');

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onContextChange(notes, links.map(l => l.url).join('\n'), instructions);
        }, 600);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [notes, links, instructions, onContextChange]);

    const addLink = () => {
        const trimmed = linkInput.trim();
        if (!trimmed) return;
        setLinks(prev => [...prev, parseLink(trimmed)]);
        setLinkInput('');
    };

    const removeLink = (index: number) => {
        setLinks(prev => prev.filter((_, i) => i !== index));
    };

    const handleLinkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addLink();
        }
    };

    const totalLinkChars = links.map(l => l.url).join('\n').length;
    const linkNear = totalLinkChars >= LIMITS.links * 0.85;

    return (
        <div className="flex flex-col gap-3">
            {/* Notes */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-indigo-500"><StickyNote size={14} /></span>
                        <h3 className="font-bold text-slate-700 text-[11px] uppercase tracking-widest">Notes</h3>
                    </div>
                    {notes.length > 0 && (
                        <span className={`text-[10px] font-semibold tabular-nums ${notes.length >= LIMITS.notes * 0.85 ? 'text-amber-500' : 'text-slate-300'}`}>
                            {notes.length}/{LIMITS.notes}
                        </span>
                    )}
                </div>
                <textarea
                    className="w-full bg-white text-slate-700 px-4 py-3 text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/20 placeholder:text-slate-300"
                    rows={8}
                    placeholder="Jot down key points, follow-ups, or anything worth remembering during this call…"
                    value={notes}
                    onChange={e => setNotes(e.target.value.slice(0, LIMITS.notes))}
                />
            </div>

            {/* Links */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-indigo-500"><Link2 size={14} /></span>
                        <h3 className="font-bold text-slate-700 text-[11px] uppercase tracking-widest">Links</h3>
                    </div>
                    {totalLinkChars > 0 && (
                        <span className={`text-[10px] font-semibold tabular-nums ${linkNear ? 'text-amber-500' : 'text-slate-300'}`}>
                            {totalLinkChars}/{LIMITS.links}
                        </span>
                    )}
                </div>

                {/* Saved links list */}
                {links.length > 0 && (
                    <div className="px-4 py-2.5 flex flex-col gap-1.5 border-b border-slate-100">
                        {links.map((link, i) => (
                            <div key={i} className="flex items-center gap-1.5 group">
                                {link.valid ? (
                                    <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-700 text-xs truncate min-w-0 flex-1"
                                        title={link.url}
                                    >
                                        <ExternalLink size={11} className="shrink-0" />
                                        <span className="truncate hover:underline">{link.raw}</span>
                                    </a>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-red-400 text-xs truncate min-w-0 flex-1" title="Invalid URL">
                                        <AlertCircle size={11} className="shrink-0" />
                                        <span className="truncate">{link.raw}</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => removeLink(i)}
                                    className="shrink-0 text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Remove"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Input row */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                    <input
                        type="text"
                        className="flex-1 bg-transparent text-slate-700 text-xs placeholder:text-slate-300 focus:outline-none min-w-0"
                        placeholder="https://example.com — press Enter to add"
                        value={linkInput}
                        onChange={e => setLinkInput(e.target.value)}
                        onKeyDown={handleLinkKeyDown}
                    />
                    <button
                        onClick={addLink}
                        disabled={!linkInput.trim()}
                        className="shrink-0 text-indigo-400 hover:text-indigo-600 disabled:text-slate-200 transition-colors"
                        title="Add link"
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            {/* AI Instructions */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-indigo-500"><Bot size={14} /></span>
                        <h3 className="font-bold text-slate-700 text-[11px] uppercase tracking-widest">AI Instructions</h3>
                    </div>
                    {instructions.length > 0 && (
                        <span className={`text-[10px] font-semibold tabular-nums ${instructions.length >= LIMITS.instructions * 0.85 ? 'text-amber-500' : 'text-slate-300'}`}>
                            {instructions.length}/{LIMITS.instructions}
                        </span>
                    )}
                </div>
                <textarea
                    className="w-full bg-white text-slate-700 px-4 py-3 text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/20 placeholder:text-slate-300"
                    rows={4}
                    placeholder='Guide the AI assistant for this call — e.g. "Focus on enterprise pricing objections" or "Customer is in healthcare industry".'
                    value={instructions}
                    onChange={e => setInstructions(e.target.value.slice(0, LIMITS.instructions))}
                />
            </div>
        </div>
    );
};
