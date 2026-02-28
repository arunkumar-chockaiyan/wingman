import React from 'react';
import { Shield, Radio, Activity } from 'lucide-react';

interface HeaderProps {
    sessionId: string;
    isCalling: boolean;
}

export const Header: React.FC<HeaderProps> = ({ sessionId, isCalling }) => {
    return (
        <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 shadow-sm mb-6 rounded-xl">
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg">
                    <Shield size={20} className="text-white" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-slate-900 leading-tight">Wingman AI</h1>
                    <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Enterprise Intel v2.0</p>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Active Session</span>
                    <span className="text-xs font-mono text-slate-600 font-medium">{sessionId.slice(0, 8)}...</span>
                </div>

                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${isCalling ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                    {isCalling ? (
                        <Radio size={14} className="animate-pulse" />
                    ) : (
                        <Activity size={14} />
                    )}
                    <span className="text-[10px] font-bold tracking-wide uppercase">
                        {isCalling ? 'Live Monitoring' : 'System Standby'}
                    </span>
                </div>
            </div>
        </header>
    );
};
