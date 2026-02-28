import React, { useState, useEffect } from 'react';
import { Settings, Bird } from 'lucide-react';

interface HeaderProps {
    sessionId: string;
    isCalling: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isCalling }) => {
    const [timer, setTimer] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isCalling) {
            interval = setInterval(() => {
                setTimer((prev) => prev + 1);
            }, 1000);
        } else {
            setTimer(0);
        }
        return () => clearInterval(interval);
    }, [isCalling]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <header className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between shadow-sm z-50">
            {/* Left: Branding */}
            <div className="flex items-center gap-4">
                <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-100">
                    <Bird size={24} className="text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">Wingman AI Assistant</h1>
                    <p className="text-xs text-slate-400 font-medium tracking-wide">Real-time sales intelligence</p>
                </div>
            </div>

            {/* Right: Controls & Status */}
            <div className="flex items-center gap-6">
                {/* Live Status Badge */}
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-full px-4 py-2">
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${isCalling ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full bg-white ${isCalling ? 'animate-pulse' : ''}`} />
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                            {isCalling ? 'Live' : 'Idle'}
                        </span>
                    </div>
                    <span className="text-sm font-mono font-bold text-slate-700 tracking-tight">
                        {formatTime(timer)}
                    </span>
                </div>

                {/* User Info */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                        <span className="text-xs font-bold text-indigo-600">AC</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Arun Chockaiyan</span>
                </div>

                {/* Settings */}
                <button className="p-2.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 transition-all shadow-sm">
                    <Settings size={18} />
                </button>
            </div>
        </header>
    );
};
