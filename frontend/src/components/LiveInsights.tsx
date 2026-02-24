import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Lightbulb, Search, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react';

const socket = io('http://localhost:3001');

interface Insight {
    id: string;
    agentId: string;
    category: string;
    content: string;
}

export const LiveInsights: React.FC = () => {
    const [insights, setInsights] = useState<Insight[]>([]);

    useEffect(() => {
        socket.on('insight', (newInsight: Insight) => {
            setInsights((prev) => [newInsight, ...prev].slice(0, 50));
        });

        return () => {
            socket.off('insight');
        };
    }, []);

    const getIcon = (category: string) => {
        if (category.includes('Sales')) return <Lightbulb className="w-5 h-5 text-yellow-500" />;
        if (category.includes('News')) return <Search className="w-5 h-5 text-blue-500" />;
        return <MessageSquare className="w-5 h-5 text-green-500" />;
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-4 overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Lightbulb /> Wingman Insights
            </h2>

            <div className="space-y-4">
                {insights.map((insight, idx) => (
                    <div key={idx} className="bg-slate-800 p-4 rounded-lg border-l-4 border-blue-500 animate-in slide-in-from-right duration-300">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                {getIcon(insight.category)}
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    {insight.category}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button className="hover:text-green-400"><ThumbsUp size={16} /></button>
                                <button className="hover:text-red-400"><ThumbsDown size={16} /></button>
                            </div>
                        </div>
                        <p className="text-sm leading-relaxed">{insight.content}</p>
                    </div>
                ))}
                {insights.length === 0 && (
                    <p className="text-slate-500 text-center mt-10 italic">
                        Waiting for call to start...
                    </p>
                )}
            </div>
        </div>
    );
};
