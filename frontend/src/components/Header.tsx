import React, { useState, useRef, useEffect } from 'react';
import { Menu, Bird, History } from 'lucide-react';

interface MenuItem {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
}

interface HeaderProps {
    onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const menuItems: MenuItem[] = [
        {
            label: 'Call History',
            icon: <History size={15} className="text-indigo-500" />,
            onClick: () => {
                setMenuOpen(false);
                onMenuClick();
            },
        },
    ];

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
                {/* User Info */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200">
                        <span className="text-xs font-bold text-indigo-600">AC</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Arun Chockaiyan</span>
                </div>

                {/* Menu button + dropdown */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen(o => !o)}
                        title="Menu"
                        className={`p-2.5 rounded-full bg-white border text-slate-500 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 transition-all shadow-sm ${menuOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200'}`}
                    >
                        <Menu size={18} />
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden animate-fade-in">
                            <div className="px-3 py-2 border-b border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Menu</p>
                            </div>
                            <ul className="py-1">
                                {menuItems.map(item => (
                                    <li key={item.label}>
                                        <button
                                            onClick={item.onClick}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                        >
                                            {item.icon}
                                            <span className="font-medium">{item.label}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
