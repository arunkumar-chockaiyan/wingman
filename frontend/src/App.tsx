import React from 'react';
import { useWingmanSession } from './hooks/useWingmanSession';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { SimulatorPanel } from './components/SimulatorPanel';
import { IntelligenceStream } from './components/IntelligenceStream';
import { ConversationTranscript } from './components/ConversationTranscript';

const App: React.FC = () => {
    const {
        isCalling,
        isSimulating,
        sessionId,
        insights,
        transcripts,
        socketConnected,
        startCall,
        startSimulation,
        stopCall
    } = useWingmanSession();

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8 flex flex-col h-screen overflow-hidden">
            <Header sessionId={sessionId} isCalling={isCalling || isSimulating} />

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
                {/* Column 1: Controls & Simulations (3/12) */}
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

                {/* Column 2: Live Transcript (6/12) */}
                <section className="lg:col-span-6 flex flex-col min-h-0">
                    <ConversationTranscript
                        transcripts={transcripts}
                        isCalling={isCalling || isSimulating}
                    />
                </section>

                {/* Column 3: AI Insights (3/12) */}
                <aside className="lg:col-span-3 flex flex-col min-h-0 overflow-hidden">
                    <IntelligenceStream
                        insights={insights}
                        isCalling={isCalling || isSimulating}
                    />
                </aside>
            </main>
        </div>
    );
};

export default App;
