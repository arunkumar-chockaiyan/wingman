import React, { useState, useEffect } from 'react';
import { Mic, Video, Monitor, Settings, PhoneOff, Bird } from 'lucide-react';

interface HeaderProps {
    sessionId: string;
    isCalling: boolean;
    onStopCall?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isCalling, onStopCall }) => {
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

                {/* Control Icons */}
                <div className="flex items-center gap-2">
                    <button className="p-2.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                        <Mic size={18} />
                    </button>
                    <button className="p-2.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                        <Video size={18} />
                    </button>
                    <button className="p-2.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                        <Monitor size={18} />
                    </button>
                    <button className="p-2.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                        <Settings size={18} />
                    </button>
                </div>

                {/* End Call Action */}
                <button
                    onClick={onStopCall}
                    disabled={!isCalling}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 ${isCalling
                            ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-100'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                        }`}
                >
                    <PhoneOff size={18} />
                    <span>End Call</span>
                </button>
            </div>
        </header>
    );
};
