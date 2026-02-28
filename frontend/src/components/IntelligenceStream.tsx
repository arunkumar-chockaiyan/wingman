import React, { useEffect, useRef } from 'react';
import { Insight } from '../types';

interface IntelligenceStreamProps {
  insights: Insight[];
  isCalling: boolean;
}

export const IntelligenceStream: React.FC<IntelligenceStreamProps> = ({ insights, isCalling }) => {
  const insightsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    insightsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [insights]);

  const getInsightColor = (category: string) => {
    if (category.toLowerCase().includes('sales'))
      return 'text-[var(--accent-warning)] border-[var(--accent-warning)]';
    if (category.toLowerCase().includes('news'))
      return 'text-[var(--accent-info)] border-[var(--accent-info)]';
    return 'text-[var(--accent-live)] border-[var(--accent-live)]';
  };

  return (
    <div className="lg:col-span-3 bg-[var(--bg-base)] border border-[var(--border-industrial)] flex flex-col h-full min-h-[400px]">
      <div className="bg-[var(--bg-panel)] border-b border-[var(--border-industrial)] px-4 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 ${isCalling ? 'bg-[var(--accent-live)] animate-cursor-blink' : 'bg-[var(--border-light)]'} rounded-none`}
          ></div>
          <h2 className="font-display font-bold uppercase text-[var(--text-primary)] text-sm tracking-widest">
            Intelligence Stream
          </h2>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest border border-[var(--border-industrial)] px-2 py-1">
          Live Log
        </span>
      </div>

      <div className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-4">
        {insights.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] opacity-50">
            <p>[ SYS ] No insights generated.</p>
            <p>[ SYS ] Initialize Sec-Link to begin processing.</p>
          </div>
        ) : null}

        {insights.map((insight, idx) => {
          const colorClasses = getInsightColor(insight.category);
          return (
            <div
              key={insight.id || idx}
              className={`flex flex-col gap-1 group animate-in fade-in duration-300`}
            >
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span>[ {new Date().toLocaleTimeString('en-US', { hour12: false })} ]</span>
                <span
                  className={`uppercase font-bold tracking-widest px-1 border border-transparent group-hover:border-current transition-colors ${colorClasses.split(' ')[0]}`}
                >
                  {insight.category}
                </span>
              </div>
              <div
                className={`pl-4 border-l ${colorClasses.replace('text-', 'border-')} border-opacity-30 group-hover:border-opacity-100 transition-colors py-1`}
              >
                <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                  {insight.content}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={insightsEndRef} />
      </div>
    </div>
  );
};
