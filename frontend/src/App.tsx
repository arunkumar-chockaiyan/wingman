import React from 'react';
import { useWingmanSession } from './hooks/useWingmanSession';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { SimulatorPanel } from './components/SimulatorPanel';
import { IntelligenceStream } from './components/IntelligenceStream';

const App: React.FC = () => {
  const {
    isCalling,
    isSimulating,
    sessionId,
    insights,
    socketConnected,
    startCall,
    startSimulation,
    stopCall,
  } = useWingmanSession();

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col h-screen">
      <Header sessionId={sessionId} isCalling={isCalling} />
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 min-h-0 overflow-hidden">
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto">
          <ControlPanel
            isCalling={isCalling || isSimulating}
            socketConnected={socketConnected}
            onStartCall={startCall}
            onStopCall={stopCall}
          />
          <SimulatorPanel onSimulate={startSimulation} isSimulating={isSimulating} />
        </div>
        <IntelligenceStream insights={insights} isCalling={isCalling || isSimulating} />
      </main>
    </div>
  );
};

export default App;
