import React, { useState } from 'react';
import { useWingmanSession } from './hooks/useWingmanSession';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { SimulatorPanel } from './components/SimulatorPanel';
import { IntelligenceStream } from './components/IntelligenceStream';
import { ConversationTranscript } from './components/ConversationTranscript';
import { CallSummary } from './components/CallSummary';
import { SalesRepPanel } from './components/SalesRepPanel';
import { CallHistoryPage } from './pages/CallHistoryPage';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<'live' | 'history'>('live');

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
        stopCall,
        updateRepContext,
        sendFeedback,
    } = useWingmanSession();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
            <Header
                isCalling={isCalling || isSimulating}
                onMenuClick={() => setCurrentView(v => v === 'history' ? 'live' : 'history')}
            />

            {currentView === 'history' ? (
                <main className="flex-1 p-6 min-h-0 overflow-hidden">
                    <CallHistoryPage onClose={() => setCurrentView('live')} />
                </main>
            ) : (
                <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 p-6">

                    {/* Column 1: Controls, Simulator, Notes/Links/Instructions (3/12) */}
                    <aside className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1 custom-scroll">
                        <ControlPanel
                            isCalling={isCalling || isSimulating}
                            socketConnected={socketConnected}
                            onStartCall={startCall}
                            onStopCall={stopCall}
                        />
                        <SalesRepPanel onContextChange={updateRepContext} />
                        <SimulatorPanel
                            onSimulate={startSimulation}
                            isSimulating={isSimulating}
                        />
                    </aside>

                    {/* Column 2: AI Insights (5/12) */}
                    <aside className="lg:col-span-5 flex flex-col min-h-0 overflow-hidden">
                        <IntelligenceStream
                            insights={insights}
                            isCalling={isCalling || isSimulating}
                            onFeedback={sendFeedback}
                        />
                    </aside>

                    {/* Column 3: Call Summary (top, larger) + Live Transcription (bottom, smaller) (4/12) */}
                    <section className="lg:col-span-4 flex flex-col gap-4 min-h-0">
                        <div className="flex-[3] min-h-0">
                            <CallSummary
                                summary={summary}
                                isSummarizing={isSummarizing}
                                isCalling={isCalling || isSimulating}
                            />
                        </div>
                        <div className="flex-[2] min-h-0">
                            <ConversationTranscript
                                transcripts={transcripts}
                                isCalling={isCalling || isSimulating}
                            />
                        </div>
                    </section>

                </main>
            )}
        </div>
    );
};

export default App;
