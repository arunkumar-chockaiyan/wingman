# Wingman Real-Time Demo Script

This document captures the exact steps, injected scripts, and timing required to capture an automated, visually-narrated demo of the Wingman application. It has been updated to include UI section highlighting and a final step to close the Call History.

## Preparation Script

Execute the following script in the browser's DevTools console before starting. This injects the visual narrator banner and a helper function to highlight individual UI blocks.

```javascript
window.injectNarrator = () => {
    if(document.getElementById('narration-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'narration-banner';
    banner.style = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); color:#fff; padding:15px 30px; font-size:22px; border-radius:8px; z-index:99999; text-align:center; pointer-events:none; font-family:sans-serif; max-width:800px; box-shadow:0 4px 10px rgba(0,0,0,0.4); border: 2px solid #6366f1; transition: all 0.3s;';
    document.body.appendChild(banner);
    
    if(!document.getElementById('demo-highlight-style')) {
        const style = document.createElement('style');
        style.id = 'demo-highlight-style';
        style.innerHTML = `
            .demo-highlight {
                background-color: #eef2ff !important;
                border-color: #6366f1 !important;
                border-width: 2px !important;
                z-index: 100 !important;
                position: relative !important;
                transition: all 0.3s ease-out !important;
            }
        `;
        document.head.appendChild(style);
    }

    if(window._highlightInterval) clearInterval(window._highlightInterval);
    window._currentHighlightTitle = null;

    window._highlightInterval = setInterval(() => {
        const title = window._currentHighlightTitle;
        const currentHighlights = document.querySelectorAll('.demo-highlight');
        
        let targetBlock = null;
        if(title) {
            const headers = Array.from(document.querySelectorAll('h2, h3'));
            const header = headers.find(h => h.textContent.toUpperCase().includes(title.toUpperCase()));
            if(header) {
                targetBlock = header.closest('.bg-white') || header.closest('div.border');
            }
        }
        
        currentHighlights.forEach(el => {
            if(el !== targetBlock) el.classList.remove('demo-highlight');
        });
        
        if(targetBlock && !targetBlock.classList.contains('demo-highlight')) {
            targetBlock.classList.add('demo-highlight');
        }
    }, 250);

    window.narrate = (text, highlightTitle = null) => { 
        document.getElementById('narration-banner').innerText = text; 
        window._currentHighlightTitle = highlightTitle;
    };
};
window.injectNarrator();

// Test initial welcome
window.narrate('Welcome to the Wingman Real-Time Sales Demo');
```

## System Architecture & Design Choices

The underlying architecture of Wingman is designed as an event-driven, real-time streaming system optimized for low-latency audio processing and scalable AI inference. 

### Core Components & Design Choices

* **Frontend (React/Vite)**: Captures audio natively and downsamples it to 16kHz PCM chunks using an `AudioWorkletNode` (`pcm-processor.js`). This choice offloads audio processing from the main browser thread to ensure a responsive UI experience.
* **Real-Time Gateway (Socket.io/Node.js)**: Acts as a low-latency bidirectional bridge between the browser and backend, allowing instantaneous pushing of transcripts and dynamically generated insights without REST polling overhead.
* **Event-Driven Backbone (Kafka in KRaft mode)**: The central component of Wingman. It completely decouples system components via distinct topics (`raw-audio`, `transcripts`, `agent-insights`). This paradigm ensures that variable LLM response times never block real-time audio ingestion, and enables seamless horizontal scalability of the AI agents.
* **Local Speech-To-Text (Vosk)**: A locally hosted Vosk service acts as the STT engine via WebSocket. Running this within the Docker compose network reduces latency and cost barriers compared to routing raw audio to external cloud STT providers.
* **Multi-Agent AI Model (Gemini 2.5)**: Instead of routing all text to a single massive prompt, the system routes continuous transcripts to specialized agents (Sales Coach, Q&A, Search). These agents are conditionally triggered by specific keywords in the transcript. This intelligent routing parallelizes AI tasks, optimizes token usage, and minimizes delays. The Search Agent further augments recommendations with real-time web context using the Tavily Web Search API.
* **Observability Pipeline**: Full OpenTelemetry instrumentation (Jaeger for traces, Loki for logs, Grafana for visualization) ties socket interactions through to Kafka message propagation, which is essential for managing and debugging an asynchronous, multi-stage data pipeline.
* **Persistence & History (PostgreSQL/Prisma)**: A relational database preserves call sessions, full transcripts, and associated AI insights, enabling teams to retrospectively review past performance and insights reliably.

### Scalability Capabilities
* **Stateless Gateway Layer**: Socket.io and Node.js orchestrator nodes can scale horizontally behind a load balancer to manage thousands of concurrent real-time audio WebSocket streams.
* **Elastic STT Workers**: Since local Vosk STT engines are containerized and decouple via WebSocket from the orchestrator, compute-heavy transcription processing can be scaled independently of the main API.
* **Kafka Consumer Groups**: Heavy AI operations are handled asynchronously. Because each AI agent operates as a member of a discrete Kafka Consumer Group (e.g. `sales-coach-group`), you can linearly scale out duplicate instances of an agent. Kafka will automatically balance processing loads across all available workers.

## Demo Execution Sequence

### Phase 1: Architecture Overview
1. **System Architecture Document**
   - **Action**: Open the `http://localhost:5173/architecture.html` file in the browser.
   - Wait 1 seconds for diagrams to load.
   - Call: `window.narrate('Before diving into the UI, let us briefly review the Wingman System Architecture.')`
   - Wait 2 seconds.
   - Call: `window.narrate('The tech stack utilizes a React frontend connected via low-latency Socket.io WebSockets to a Node.js backend.')`
   - **Action**: Scroll down roughly 400 pixels to show the '1. High-Level Component Overview' mermaid diagram on screen. 
   - Wait 4 seconds.
   - Call: `window.narrate('For scalable design, we leverage an event-driven Kafka backbone in KRaft mode to decouple audio processing from AI inference.')`
   - **Action**: Scroll down roughly 800 pixels to show the '2. Real-Time Data Flow (Sequence)' diagram.
   - Wait 4 seconds.
   - Call: `window.narrate('From raw audio ingestion to the Tavily Web Search agent, everything runs in parallel, persisting securely to PostgreSQL.')`
   - Wait 4 seconds.
   - Call: `window.narrate('Notice how sudden spikes in conversational volume are gracefully buffered by Kafka, preventing any UI unresponsiveness.')`
   - **Action**: Scroll down roughly 1000 pixels to show '3. Kafka Topics & Consumer Groups'.
   - Wait 4 seconds.
   - Call: `window.narrate('Instead of a single monolithic prompt, we utilize a multi-agent Gemini 2.5 setup routed through Kafka Consumer Groups.')`
   - Wait 3 seconds.
   - Call: `window.narrate('If usage surges, we can simply spin up extra agent containers to digest the topic queues.')`
   - **Action**: Scroll down roughly 1000 pixels to show '4. Agentic Analysis Pipeline'.
   - Wait 4 seconds.
   - Call: `window.narrate('Trigger-based routing ensures that specialized agents run concurrently, reducing overall inference latency during active calls.')`
   - **Action**: Scroll down roughly 1000 pixels to show '5. Audio Pipeline Detail'.
   - Wait 4 seconds.
   - Call: `window.narrate('Our backend connects to a locally-hosted Vosk Speech-to-Text engine, eliminating cloud STT latency and costs.')`
   - **Action**: Scroll down roughly 800 pixels to show '6. Simulator Panel Flow'.
   - Wait 4 seconds.
   - Call: `window.narrate('This allows us to simulate and test Google TTS prospect interactions exactly as they would stream from a live microphone.')`
   - **Action**: Scroll down roughly 800 pixels to show '7. Observability Stack' and '8. Infrastructure (Docker Compose)'.
   - Wait 4 seconds.
   - Call: `window.narrate('Finally, the entire stack runs reliably in Docker Compose, fully instrumented via OpenTelemetry, Jaeger, and Grafana.')`
   - Wait 4 seconds.

### Phase 2: Interactive UI Walkthrough
1. **Initial Load**
   - Wait 1 seconds.
2. **Control Panel**
   - Call: `window.narrate('On the left, the Control Panel manages active calls and socket connections.', 'Simulate a Sales Conversation')`
   - Wait 3 seconds.
3. **Notes Block**
   - Call: `window.narrate('The Notes panel allows reps to jot down key points before and during the live call.', 'Notes')`
   - **Action**: Type into the Notes text area: *"Prospect tired of manual risk reports. Uses Riskalyze but doesn't trust scores."*
   - Wait 3 seconds.
4. **Links Block**
   - Call: `window.narrate('The Links panel stores external resources or references needed on the fly.', 'Links')`
   - **Action**: Type `https://stratifi.com/riskalyze-comparison` into the link input and press Enter (or click +).
   - **Action**: Type `https://stratifi.com/pricing` into the link input and press Enter.
   - Wait 3 seconds.
5. **AI Instructions Block**
   - Call: `window.narrate('Provide custom AI Instructions to steer the focus of the real-time insights.', 'AI Instructions')`
   - **Action**: Type into the AI Instructions text area: *"Focus on risk profiling accuracy, speed of automated branded reports, and overcoming objections against Riskalyze."*
   - Wait 3 seconds.
6. **Simulator Panel**
   - Call: `window.narrate('At the bottom, the Simulator lets you quickly test sales scenarios.', 'Replay Sales Call Transcript')`
   - Wait 3 seconds.
7. **Intelligence Stream & Summary (Center/Right)**
   - Call: `window.narrate('The center panel surfaces live coaching insights from Gemini.', null)`
   - Wait 3 seconds.
   - Call: `window.narrate('While the right section presents real-time Summaries and Transcripts.', null)`
   - Wait 2 seconds.

### Phase 3: Running the Simulator
1. **Prepare text**
   - Call: `window.narrate('Let us simulate a sales call using a predefined script.', 'Replay Sales Call Transcript')`
   - In the Simulator Panel text area, enter: 
     > *"SDR: Hi Tom, this is Matt with Stratifi. You were not expecting my call. Want to hang up now or roll the dice?
     > Prospect: What's this about?
     > SDR: It's pretty common to see wealth advisors cobbling together tools like Riskalyze, Totem, and Hidden Levers in order to do risk profiling of clients. How are you handling risk profiling today?
     > Prospect: I've used Riskalyze before, not a fan. Where did you say you were calling from again?
     > SDR: I'm with Stratifi. It's pretty common to hear wealth advisors not being satisfied with them. Was it the price or how much work it took you that turned you off?
     > Prospect: I didn't trust the scores. We did a lot of copy/paste work and only used part of the reports it generated.
     > SDR: How important is the report for you? Do you email your clients your reports after meetings?
     > Prospect: Yes, it's a big difference on our approach to services. We keep our clients informed and prepared with branded reports.
     > SDR: I hear that quite often Tom. Service is everything in this business. Well, I'd imagine my timing is most likely wrong, unless you're open to looking at avoiding wasting time on custom reporting?
     > Prospect: What do you all do?
     > SDR: Stratifi was born when 3 quants and a rocket scientist got into a room to make risk profiling easy for the rest of us. Advisors hate not having ready made reports for their clients, so we fixed that.
     > Prospect: How does it work?
     > SDR: We stopped using outdated modelling and focus on risk exposure instead of just volatility. I know I promised to take only a bit in the beginning of the call. Would you have time in the next day or two to discuss it properly?
     > Prospect: Sure, I can do Thursday. Can you send me something beforehand to see it?
     > SDR: Absolutely. I'll attach an example to the calendar invite."*
2. **Execute**
   - Click the **Replay Transcript** button.
   - **Action**: Scroll the left panel (or page) back to the top so the active call controls are visible.
   - Call: `window.narrate('The backend orchestrator and AI agents are processing the conversation...', null)`

### Phase 4: Interact with Insights
1. **Insight Generation**
   - Wait 5–15 seconds for insights to load.
   - Call: `window.narrate('Awesome! We have our first AI Insight displayed instantly.')`
   - Wait 2 seconds.
2. **Provide Feedback**
   - Click the **thumbs up** (helpful/like) icon on the first AI insight card.
   - Call: `window.narrate('We can provide immediate feedback on insights to improve future AI coaching.')`
   - Wait 2 seconds.
3. **View Summary Generation**
   - Call: `window.narrate('The real-time call summary is automatically synthesized on the right.')`
   - Wait 2 seconds.
4. **Complete Audio Playback**
   - **Action**: Wait until the audio playback in the browser finishes and the simulator automatically ends the call (the UI status will transition from 'Call Active' back to normal).

### Phase 5: Call History & Wrap-Up
1. **Navigate to History**
   - Call: `window.narrate('Let us review session persistence in the Call History.')`
   - Click the general settings/menu icon in the top header to toggle to Call History.
2. **Expand Insights**
   - If closed, click on the **topmost call session row** to view its dedicated insights and summary.
   - Call: `window.narrate('This historical view preserves past insights, transcripts, and summaries securely.')`
   - Wait 4 seconds.
3. **Closing the History**
   - Call: `window.narrate('Returning to the live dashboard.')`
   - Click the **Close** button (or click the menu icon again) to exit the Call History and return to the live interface.
4. **End**
   - Call: `window.narrate('Demo Complete.', null)`
   - Wait 2 seconds, stop recording.
