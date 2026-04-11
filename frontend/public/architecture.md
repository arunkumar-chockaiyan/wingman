# Wingman — System Architecture

## 1. High-Level Component Overview

```mermaid
graph TD
    subgraph "Browser (React + Vite)"
        UI[UI Components]
        Hook[useWingmanSession hook]
        PCM[pcm-processor.js\nAudioWorklet]
        UI --> Hook
        Hook --> PCM
    end

    subgraph "Backend (Node.js / Express)"
        SIO[Socket.io Server]
        REST[REST Endpoints\n/api/simulate-tts]
        SVC[CallSessionService]
        ORCH[Orchestrator]
        SIO --> SVC
        SIO --> ORCH
        REST --> TTS[Google TTS API]
    end

    subgraph "Kafka (KRaft)"
        T1[raw-audio]
        T2[transcripts]
        T3[agent-insights]
    end

    subgraph "Agentic Layer"
        SC[Sales Coach Agent\nsales-coach-group]
        QA[Q&A Agent\nqa-agent-group]
        SA[Search Agent\nsearch-agent-group]
        SA --> TAVILY[Tavily Search API]
        SC & QA & SA --> GEMINI[Gemini 1.5 Flash]
    end

    subgraph "Observability"
        LOKI[Loki\nLog Aggregation]
        JAEGER[Jaeger\nTrace Visualization]
        GRAFANA[Grafana Dashboard]
        GRAFANA --> LOKI
        GRAFANA --> JAEGER
    end

    PCM -->|audio-chunk event| SIO
    Hook -->|start-call / end-call / feedback| SIO
    SIO -->|session-started / transcript / insight| Hook

    ORCH -->|produce| T1
    ORCH -->|consume audio-processors| T1
    ORCH -->|consume transcript-feed| T2
    ORCH -->|consume result-aggregators| T3

    ORCH <-->|WebSocket per session| VOSK[Vosk STT\nws://localhost:2700]
    VOSK -->|final transcript| ORCH
    ORCH -->|produce| T2

    T2 -->|consume| SC
    T2 -->|consume| QA
    T2 -->|consume| SA

    SC & QA & SA -->|produce| T3

    SVC <-->|Prisma ORM| DB[(PostgreSQL)]

    Hook -->|Backend URL| REST

    Backend -->|OTLP gRPC| JAEGER
    Backend -->|Winston JSON| LOKI
```

---

## 2. Real-Time Data Flow (Sequence)

```mermaid
sequenceDiagram
    participant Browser
    participant Backend as Backend (Socket.io)
    participant Kafka
    participant Vosk as Vosk STT
    participant Agents as AI Agents
    participant Gemini
    participant DB as PostgreSQL

    Browser->>Backend: start-call { sessionId, title }
    Backend->>DB: INSERT CallSession
    Backend-->>Browser: session-started { sessionId }

    loop Audio Streaming
        Browser->>Backend: audio-chunk { sessionId, chunk }
        Backend->>Kafka: produce → raw-audio [key=sessionId]
        Kafka->>Backend: consume (audio-processors)
        Backend->>Vosk: stream PCM bytes
        Vosk-->>Backend: { text: "final transcript" }
        Backend->>Kafka: produce → transcripts [key=sessionId]
        Kafka->>Backend: consume (transcript-feed)
        Backend-->>Browser: transcript { transcript, timestamp }
    end

    par Agent Processing
        Kafka->>Agents: consume transcripts (sales-coach-group / qa-agent-group / search-agent-group)
        Agents->>Gemini: generateContent()
        Gemini-->>Agents: insight text
        Agents->>Kafka: produce → agent-insights [key=sessionId]
        Kafka->>Backend: consume (result-aggregators)
        Backend-->>Browser: insight { id, content, category, agentId }
    end

    Browser->>Backend: feedback { id, status: liked|disliked }
    Backend->>DB: UPDATE Recommendation.feedbackStatus

    Browser->>Backend: end-call { sessionId }
    Backend->>DB: UPDATE CallSession { endTime, fullTranscript }
    Backend->>Vosk: send { "eof": 1 } → close WebSocket
```

---

## 3. Kafka Topics & Consumer Groups

```mermaid
graph LR
    subgraph "Producers"
        P1[Backend\nOrchestrator]
        P2[Sales Coach Agent]
        P3[Q&A Agent]
        P4[Search Agent]
    end

    subgraph "Topics"
        T1[(raw-audio)]
        T2[(transcripts)]
        T3[(agent-insights)]
    end

    subgraph "Consumers"
        CG1[audio-processors\nOrchestrator]
        CG2[transcript-feed\nOrchestrator]
        CG3[sales-coach-group\nSales Coach Agent]
        CG4[qa-agent-group\nQ&A Agent]
        CG5[search-agent-group\nSearch Agent]
        CG6[result-aggregators\nOrchestrator]
    end

    P1 -->|PCM audio bytes| T1
    CG1 -->|subscribe| T1

    CG1 -->|Vosk STT| T2
    P2 -->|insight JSON| T3
    P3 -->|insight JSON| T3
    P4 -->|insight JSON| T3

    CG2 -->|subscribe| T2
    CG3 -->|subscribe| T2
    CG4 -->|subscribe| T2
    CG5 -->|subscribe| T2

    CG6 -->|subscribe| T3
```

| Topic | Key | Value | Produced By | Consumed By |
|---|---|---|---|---|
| `raw-audio` | `sessionId` | Raw PCM `Buffer` | Orchestrator | `audio-processors` (Orchestrator) |
| `transcripts` | `sessionId` | `{ transcript, timestamp }` JSON | Orchestrator (via Vosk) | `transcript-feed`, `sales-coach-group`, `qa-agent-group`, `search-agent-group` |
| `agent-insights` | `sessionId` | `{ agentId, category, content }` JSON | All three agents | `result-aggregators` (Orchestrator) |

---

## 4. Agentic Analysis Pipeline

```mermaid
flowchart TD
    T[transcript message\nfrom Kafka]

    T --> SC_KW{Sales Coach\ntrigger keywords?}
    T --> QA_KW{Q&A Agent\ntrigger keywords?}
    T --> SA_KW{Search Agent\ntrigger keywords?}

    SC_KW -- yes --> SC_LLM[Gemini 1.5 Flash\nSales coaching prompt]
    QA_KW -- yes --> QA_LLM[Gemini 1.5 Flash\nQ&A prompt]
    SA_KW -- yes --> SA_QG[Gemini 1.5 Flash\nGenerate search query]

    SA_QG --> SA_WEB[Tavily Web Search\nmaxResults=3]
    SA_WEB --> SA_SUM[Gemini 1.5 Flash\nSummarize results]

    SC_LLM --> KI[agent-insights topic]
    QA_LLM --> KI
    SA_SUM --> KI

    KI --> AGG[result-aggregators\nOrchestrator consumer]
    AGG --> WS[Socket.io 'insight' event\nto session room]
    WS --> UI[Frontend Intelligence Stream]
```

### Agent Trigger Keywords

| Agent | Group ID | Trigger Keywords |
|---|---|---|
| Sales Coach | `sales-coach-group` | `budget`, `price`, `competitor`, `interest`, `no`, `yes`, `how much` |
| Q&A Agent | `qa-agent-group` | `how do I`, `what is`, `can we`, `does it`, `why`, `difference` |
| Search Agent | `search-agent-group` | `competitor`, `news`, `industry trend`, `pricing`, `feature compare` |

---

## 5. Audio Pipeline Detail

```mermaid
flowchart LR
    MIC[Browser Microphone<br>getUserMedia]
    TTS_SIM[TTS Simulation<br>Audio Element]

    MIC --> AC[AudioContext<br>native sample rate]
    TTS_SIM --> AC

    AC --> WN[pcm-processor.js<br>AudioWorkletNode<br>downsamples to 16kHz PCM]
    WN -->|ArrayBuffer chunks<br>via port.onmessage| SIO_EMIT[socket.emit<br>audio-chunk]

    SIO_EMIT --> BE[Backend<br>Socket.io]
    BE --> KP[Kafka Producer<br>raw-audio topic]
    KP --> KC[Kafka Consumer<br>audio-processors]
    KC --> VS[Vosk WebSocket<br>ws://localhost:2700<br>per session]
    VS -->|transcript text| KP2[Kafka Producer<br>transcripts topic]
```

---

## 6. Simulator Panel Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Kafka
    participant Vosk
    participant Agents

    User->>Frontend: Paste transcript text → click Simulate
    Frontend->>Backend: POST /api/simulate-tts { text }
    Backend->>Google TTS: getAllAudioBase64(text)
    Google TTS-->>Backend: [ { base64 } ... ]
    Backend-->>Frontend: { audioChunks: [...] }

    Frontend->>Frontend: Decode + stitch base64 → Blob URL
    Frontend->>Frontend: new Audio(blobUrl).captureStream()
    Frontend->>Frontend: AudioContext + AudioWorklet connected

    Frontend->>Backend: start-call { sessionId, title: "Replay Simulation" }
    Backend-->>Frontend: session-started

    loop Audio playback
        Frontend->>Backend: audio-chunk (PCM from worklet)
        Backend->>Kafka: raw-audio
        Kafka->>Vosk: PCM stream
        Vosk-->>Backend: transcripts
        Kafka->>Agents: transcripts
        Agents-->>Backend: agent-insights
        Backend-->>Frontend: transcript + insight events
    end

    Note over Frontend: audio.onended fires
    Frontend->>Backend: end-call { sessionId }
```

---

## 7. Observability Stack

```mermaid
graph TD
    subgraph "Application"
        WIN[Wingman Backend\nNode.js]
        WIN -->|Winston JSON logs\nstdout| LOKI
        WIN -->|OTLP gRPC :4317\nspans & traces| JAEGER
    end

    subgraph "Storage & Visualization"
        LOKI[Grafana Loki\n:3100]
        JAEGER[Jaeger All-in-One\n:16686 UI\n:4317 OTLP]
        GRAFANA[Grafana\n:3000]
        GRAFANA -->|LogQL queries| LOKI
        GRAFANA -->|Trace queries| JAEGER
    end
```

### Instrumented Spans

| Span Name | Trigger | Attributes |
|---|---|---|
| `socket.start-call` | `start-call` socket event | `call.title`, `call.session_id` |
| `socket.feedback` | `feedback` socket event | `feedback.id`, `feedback.status` |
| `socket.end-call` | `end-call` socket event | `call.session_id` |

Auto-instrumented via OpenTelemetry SDK: HTTP, Express routes, KafkaJS producers/consumers.

Each log entry is automatically enriched with `traceId` and `spanId` from the active OTel context, enabling log-to-trace correlation in Grafana.

---

## 8. Infrastructure (Docker Compose)

```mermaid
graph TD
    subgraph "Docker Compose Network"
        VOSK[wingman-vosk\nalphacep/kaldi-en\n:2700]
        KAFKA[wingman-kafka\nconfluentinc/cp-kafka\nKRaft mode\n:9092 external\n:29092 internal]
        KAFKAUI[wingman-kafka-ui\nprovectuslabs/kafka-ui\n:8080]
        LOKI[wingman-loki\ngrafana/loki\n:3100]
        JAEGER[wingman-jaeger\njaegertracing/all-in-one\n:16686 UI\n:4317 OTLP gRPC\n:4318 OTLP HTTP]
        GRAFANA[wingman-grafana\ngrafana/grafana\n:3000]
    end

    subgraph "Host"
        BE[Wingman Backend\n:3001]
        FE[Wingman Frontend\n:5173]
        PG[PostgreSQL\n:5432]
    end

    BE <-->|ws| VOSK
    BE <-->|:9092| KAFKA
    KAFKAUI <-->|:29092| KAFKA
    BE -->|:3100| LOKI
    BE -->|:4317| JAEGER
    GRAFANA --> LOKI
    GRAFANA --> JAEGER
    BE <-->|Prisma| PG
    FE <-->|Socket.io / REST| BE
```
