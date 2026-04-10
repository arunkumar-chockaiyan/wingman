import React from 'react';
import { useWingmanSession } from './hooks/useWingmanSession';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { SimulatorPanel } from './components/SimulatorPanel';
import { IntelligenceStream } from './components/IntelligenceStream';
import { ConversationTranscript } from './components/ConversationTranscript';
import { CallSummary } from './components/CallSummary';

const App: React.FC = () => {
    const {
        isCalling,
        isSimulating,
        insights,
        transcripts,
        summary,
        isSummarizing,
        socketConnected,
        startCall,
        startSimulation,
        stopCall
    } = useWingmanSession();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
            <Header
                isCalling={isCalling || isSimulating}
            />

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 p-6">
                {/* Column 1: Live Transcript + Call Summary (4/12) */}
                <section className="lg:col-span-4 flex flex-col gap-4 min-h-0">
                    <div className="flex-1 min-h-0">
                        <ConversationTranscript
                            transcripts={transcripts}
                            isCalling={isCalling || isSimulating}
                        />
                    </div>
                    <CallSummary
                        summary={summary}
                        isSummarizing={isSummarizing}
                        isCalling={isCalling || isSimulating}
                    />
                </section>

                {/* Column 2: AI Insights (5/12) */}
                <aside className="lg:col-span-5 flex flex-col min-h-0 overflow-hidden">
                    <IntelligenceStream
                        insights={insights}
                        isCalling={isCalling || isSimulating}
                    />
                </aside>

                {/* Column 3: Controls & Simulations (3/12) */}
                <aside className="lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-1 custom-scroll">
                    <ControlPanel
                        isCalling={isCalling || isSimulating}
                        socketConnected={socketConnected}
                        onStartCall={startCall}
                        onStopCall={stopCall}
                    />
                    <SimulatorPanel
                        onSimulate={startSimulation}
                        isSimulating={isSimulating}
                    />
                </aside>
            </main>
        </div>
    );
};

export default App;
