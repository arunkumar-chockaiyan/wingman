import React from 'react';

interface HeaderProps {
    sessionId: string;
    isCalling: boolean;
}

export const Header: React.FC<HeaderProps> = ({ sessionId, isCalling }) => {
    return (
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-[var(--border-industrial)] pb-4 shrink-0">
            <div>
                <h1 className="text-4xl font-display font-bold text-[var(--text-primary)] tracking-tight uppercase flex items-center gap-1">
                    WINGMAN<span className="text-[var(--accent-live)]">_</span>SYS
                </h1>
                <p className="text-[var(--text-muted)] text-sm uppercase tracking-widest mt-1 hidden md:block">
                    Real-Time Intelligence HUD // v1.0.4
                </p>
            </div>
            <div className="text-[var(--text-muted)] text-xs md:text-sm text-right mt-4 md:mt-0 flex flex-col items-end">
                <div className="flex items-center gap-2 mb-1">
                    <span className="uppercase tracking-widest text-[10px] text-[var(--border-light)]">Session ID</span>
                    <span className="bg-[var(--bg-panel)] px-2 py-1 border border-[var(--border-industrial)]">
                        {sessionId.slice(0, 8)}{sessionId ? <span className="animate-cursor-blink text-[var(--accent-live)]">_</span> : null}
                    </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="uppercase tracking-widest text-[10px] text-[var(--border-light)]">Status</span>
                    {isCalling ? (
                        <span className="text-[var(--bg-base)] bg-[var(--accent-live)] px-2 py-1 font-bold text-xs">
                            LIVE
                        </span>
                    ) : (
                        <span className="text-[var(--text-muted)] bg-[var(--bg-panel)] border border-[var(--border-industrial)] px-2 py-1 text-xs">
                            STANDBY
                        </span>
                    )}
                </div>
            </div>
        </header>
    );
};
