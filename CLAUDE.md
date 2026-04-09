# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Wingman** is a real-time AI sales assistant that listens to live sales calls, transcribes speech via Vosk STT, and runs multiple AI agents (powered by Gemini 1.5 Flash) in parallel to generate coaching feedback, answer questions, and surface competitive research — all streamed to the frontend in real time.

## Commands

### Backend
```bash
npm run dev          # Start backend in dev mode (ts-node + dotenv)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled dist/

npm run infra:up     # Start Docker services (Kafka, Vosk, Loki, Jaeger, Grafana, Kafka UI)
npm run infra:down   # Stop Docker services

npm run db:setup     # Run migrations + seed (creates default admin user)
npm run prisma:migrate
npm run prisma:generate
npm run prisma:studio
```

### Frontend (run from `frontend/` directory)
```bash
cd frontend && npm run dev    # Vite dev server
cd frontend && npm run build
```

### Testing
```bash
npm test                  # Unit tests (Vitest)
npm run test:integration  # Integration tests (Vitest with forks)
```

## Infrastructure Setup

All infrastructure runs via Docker Compose. Required before starting the backend:
```bash
npm run infra:up
```

| Service   | Port  | Purpose                          |
|-----------|-------|----------------------------------|
| Vosk STT  | 2700  | WebSocket speech-to-text         |
| Kafka     | 9092  | Event bus (KRaft mode)           |
| Kafka UI  | 8080  | Kafka topic inspection           |
| Loki      | 3100  | Log aggregation                  |
| Jaeger    | 16686 | Distributed trace visualization  |
| Grafana   | 3000  | Unified observability dashboard  |

## Environment Variables (`.env`)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wingman?schema=public
KAFKA_BROKER=127.0.0.1:9092
GEMINI_API_KEY=          # Required for all agents
TAVILY_API_KEY=          # Required for Search Agent
VOSK_URL=ws://127.0.0.1:2700
PORT=3001
LOKI_HOST=http://localhost:3100
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
NODE_ENV=development
LOG_LEVEL=debug
```

## Architecture

### Data Flow
```
Frontend (MediaRecorder)
  → Socket.io audio-chunk events
  → Kafka raw-audio topic
  → Vosk WebSocket (per session)
  → Kafka transcripts topic
  → Three parallel agents (Sales Coach, Q&A, Search)
  → Kafka agent-insights topic
  → result-aggregator consumer
  → Socket.io insight events back to frontend
  → PostgreSQL (all sessions/transcripts/recommendations persisted)
```

### Kafka Topics & Consumer Groups
- `raw-audio` → consumed by `audio-processors` group (streams to Vosk per session)
- `transcripts` → consumed by `transcript-feed` (frontend display) and all agents
- `agent-insights` → consumed by `result-aggregators` (routes insights to connected clients)

### Key Source Files

| File | Role |
|------|------|
| `src/index.ts` | Bootstrap: tracing init → Kafka setup → agent start → Express |
| `src/server.ts` | Express + Socket.io, all real-time event handlers |
| `src/services/kafkaOrchestrator.ts` | Kafka producer/consumer lifecycle, Vosk WebSocket management |
| `src/services/callSessionService.ts` | Business logic: start/end sessions, save insights, record feedback |
| `src/agents/coreAgents.ts` | `GenericAgent` base class; exports `salesCoachAgent` and `qaAgent` |
| `src/agents/searchAgent.ts` | 3-step pipeline: query gen → Tavily search → Gemini summarize |
| `src/prompts/agentTemplates.ts` | Trigger keywords and system prompts for each agent |
| `src/config/tracing.ts` | OpenTelemetry SDK initialization (must run before all imports) |
| `src/utils/logger.ts` | Winston logger with Loki transport and OTel trace ID injection |

### Agent System

Agents extend `GenericAgent` and trigger on keyword matches in transcript text:
- **Sales Coach**: budget, price, competitor, interest, tone, objections
- **Q&A**: how-to, what-is, can-we, does-it, why, difference
- **Search**: competitor, news, industry trends, pricing, feature comparisons

The Search Agent runs a 3-step Gemini → Tavily → Gemini pipeline and takes longer to respond.

### Data Model (Prisma)
- `User` (email unique) → has many `CallSession`
- `CallSession` → startTime, endTime, fullTranscript, summary → has many `Recommendation`
- `Recommendation` → content, category, agentId, contextSnippet, feedbackStatus (`NONE|LIKED|DISLIKED`)

### Frontend Architecture
The frontend is a separate Node.js app in `frontend/`. The main logic lives in `frontend/src/hooks/useWingmanSession.ts`, which manages the Socket.io connection, audio recording/chunking, and real-time event handling. The **Simulator Panel** lets you paste a transcript and replay it through the full AI pipeline via TTS.

### Tracing Caveat
`src/config/tracing.ts` must be initialized before any other imports in `src/index.ts` because OpenTelemetry patches modules at import time. Do not reorder that import.
