# Wingman Real-Time Demo Script

This document captures the exact steps, injected scripts, and timing required to capture an automated, visually-narrated demo of the Wingman application. It has been updated to include UI section highlighting and a final step to close the Call History.

## Preparation Script

Execute the following script in the browser's DevTools console before starting. This injects the visual narrator banner and a helper function to highlight individual UI blocks.

```javascript
// 1. Inject the Narration Banner
const banner = document.createElement('div');
banner.id = 'narration-banner';
banner.style = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); color:#fff; padding:15px 30px; font-size:22px; border-radius:8px; z-index:99999; text-align:center; pointer-events:none; font-family:sans-serif; max-width:800px; box-shadow:0 4px 10px rgba(0,0,0,0.4); border: 2px solid #6366f1; transition: all 0.3s;';
document.body.appendChild(banner);

// 2. Highlighting Utility
window.highlightPanel = (titleText) => {
    // Reset all previous highlights
    document.querySelectorAll('.demo-highlight').forEach(el => {
        el.style.backgroundColor = '';
        el.style.borderColor = '';
        el.style.borderWidth = '';
        el.style.zIndex = '';
        el.classList.remove('demo-highlight');
    });
    
    if (!titleText) return; // Pass null to remove all highlights
    
    // Find the panel by matching text in its header (h2 or h3)
    const headers = Array.from(document.querySelectorAll('h2, h3'));
    const header = headers.find(h => h.textContent.toUpperCase().includes(titleText.toUpperCase()));
    
    if (header) {
        // Find the parent container (usually a white card block)
        const block = header.closest('.bg-white') || header.closest('div.border');
        if (block) {
            block.classList.add('demo-highlight');
            // Apply a clear inner highlight without overflowing borders
            block.style.backgroundColor = '#eef2ff'; // Light shaded indigo background
            block.style.borderColor = '#6366f1';     // Indigo border
            block.style.borderWidth = '2px';
            block.style.zIndex = '100';
            block.style.position = 'relative';
            block.style.transition = 'all 0.3s ease-out';
        }
    }
};

// 3. Narration Wrapper
window.narrate = (text, highlightTitle = null) => { 
    document.getElementById('narration-banner').innerText = text; 
    window.highlightPanel(highlightTitle);
};

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
* **Multi-Agent AI Model (Gemini 1.5 Flash)**: Instead of routing all text to a single massive prompt, the system routes continuous transcripts to specialized agents (Sales Coach, Q&A, Search). These agents are conditionally triggered by specific keywords in the transcript. This intelligent routing parallelizes AI tasks, optimizes token usage, and minimizes delays. The Search Agent further augments recommendations with real-time web context using the Tavily Web Search API.
* **Observability Pipeline**: Full OpenTelemetry instrumentation (Jaeger for traces, Loki for logs, Grafana for visualization) ties socket interactions through to Kafka message propagation, which is essential for managing and debugging an asynchronous, multi-stage data pipeline.
* **Persistence & History (PostgreSQL/Prisma)**: A relational database preserves call sessions, full transcripts, and associated AI insights, enabling teams to retrospectively review past performance and insights reliably.

### Scalability Capabilities
* **Stateless Gateway Layer**: Socket.io and Node.js orchestrator nodes can scale horizontally behind a load balancer to manage thousands of concurrent real-time audio WebSocket streams.
* **Elastic STT Workers**: Since local Vosk STT engines are containerized and decouple via WebSocket from the orchestrator, compute-heavy transcription processing can be scaled independently of the main API.
* **Kafka Consumer Groups**: Heavy AI operations are handled asynchronously. Because each AI agent operates as a member of a discrete Kafka Consumer Group (e.g. `sales-coach-group`), you can linearly scale out duplicate instances of an agent. Kafka will automatically balance processing loads across all available workers.

## Demo Execution Sequence

### Phase 1: Architecture Overview
1. **System Architecture Document**
   - **Action**: Open the `docs/architecture/system-architecture.md` file in the IDE or Markdown viewer.
   - Call: `window.narrate('Before diving into the UI, let us briefly review the Wingman System Architecture.')`
   - Wait 4 seconds.
   - Call: `window.narrate('The system relies on an event-driven Kafka backbone, decoupling real-time WebSockets from local STT and Gemini multi-agent processing.')`
   - Wait 5 seconds.
   - Call: `window.narrate('This ensures the UI remains responsive, latency stays low, and stateless AI workers can scale instantly via Consumer Groups.')`
   - Wait 4 seconds.

### Phase 2: Interactive UI Walkthrough
1. **Initial Load**
   - Wait 3 seconds.
2. **Control Panel**
   - Call: `window.narrate('On the left, the Control Panel manages active calls and socket connections.', 'Simulate a Sales Conversation')`
   - Wait 2 seconds.
3. **Notes Block**
   - Call: `window.narrate('The Notes panel allows reps to jot down key points during the live call.', 'Notes')`
   - **Action**: Type into the Notes text area: *"Customer currently evaluating alternatives. Needs quick deployment."*
   - Wait 2 seconds.
4. **Links Block**
   - Call: `window.narrate('The Links panel stores external resources or references needed on the fly.', 'Links')`
   - **Action**: Type `https://wingman.com/pricing` into the link input and press Enter (or click +).
   - **Action**: Type `https://wingman.com/competitor-battlecard` into the link input and press Enter.
   - Wait 2 seconds.
5. **AI Instructions Block**
   - Call: `window.narrate('Provide custom AI Instructions to steer the focus of the real-time insights.', 'AI Instructions')`
   - **Action**: Type into the AI Instructions text area: *"Focus heavily on why our CRM is faster and more intuitive than legacy systems. Suggest annual discount if price is mentioned. Compare with competitors."*
   - Wait 2 seconds.
6. **Simulator Panel**
   - Call: `window.narrate('At the bottom, the Simulator lets you quickly test sales scenarios.', 'Replay Sales Call Transcript')`
   - Wait 2 seconds.
7. **Intelligence Stream & Summary (Center/Right)**
   - Call: `window.narrate('The center panel surfaces live coaching insights from Gemini.', null)`
   - Wait 2 seconds.
   - Call: `window.narrate('While the right section presents real-time Summaries and Transcripts.', null)`
   - Wait 2 seconds.

### Phase 3: Running the Simulator
1. **Prepare text**
   - Call: `window.narrate('Let us simulate a sales call using a predefined script.', 'Replay Sales Call Transcript')`
   - In the Simulator Panel text area, enter: 
     > *"Alex: Hi Sarah, this is Alex from Wingman CRM. You weren't expecting my call today, do you have a quick minute or should we roll the dice?
     > Sarah: What's this regarding?
     > Alex: Well, I've been talking to a lot of VP of Sales lately, and they often mention their teams are getting bogged down by legacy tools like Salesforce. Out of curiosity, how is your team handling their pipeline today?
     > Sarah: We use Salesforce, but our current setup is getting way too slow. Where did you say you were calling from?
     > Alex: I'm with Wingman CRM. We specialize in fast, intuitive interfaces for scaling teams. Is the speed of the interface your main frustration, or is it the cost?
     > Sarah: Mostly the speed, but pricing is a factor. I have a team of about 50 salespeople. What pricing do you offer?"*
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
