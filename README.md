# Wingman: Real-Time Sales Assistant

Wingman is an intelligent, real-time sales assistant designed to empower sales professionals during live calls. It leverages a multi-agent orchestration architecture using Apache Kafka and Google's Gemini AI to provide live transcription, actionable insights, and automated research.

## 🚀 Features

- **Live Audio Processing**: Real-time audio ingestion and processing using Vosk STT.
- **Agentic Insights**:
    - **Sales Coach Agent**: Provides real-time feedback on tone and objection handling.
    - **Q&A Agent**: Answers questions surfacing during the conversation.
    - **Search Agent**: Automatically performs web searches (via Tavily) to provide context on competitors or products.
- **Event-Driven Architecture**: High-throughput orchestration using Apache Kafka.
- **TTS Simulation**: Built-in Text-to-Speech simulation for testing and accessibility.
- **Persistence**: Full call history and recommendation tracking with Prisma and PostgreSQL.
- **Kafka Monitoring**: Built-in Kafka UI for observing event streams and consumer groups.

## 🛠 Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Socket.io-client.
- **Backend**: Node.js, Express, Socket.io, KafkaJS.
- **AI/LLM**: Google Gemini 1.5 Flash, Tavily Search API.
- **STT**: Vosk (via Docker).
- **Database**: PostgreSQL with Prisma ORM.
- **Infrastructure**: Docker Compose (Kafka, Vosk, Kafka UI).

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://www.docker.com/) and Docker Compose
- [Google AI API Key](https://aistudio.google.com/) (for Gemini)
- [Tavily API Key](https://tavily.com/) (for Search Agent)

## ⚙️ Getting Started

### 1. Clone and Install
```bash
git clone <repository-url>
cd wingman
npm install
cd frontend && npm install && cd ..
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
PORT=3001
KAFKA_BROKER=localhost:9092
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
DATABASE_URL="postgresql://user:password@localhost:5432/wingman"
```

### 3. Start Infrastructure
Launch Kafka and Vosk using Docker:
```bash
npm run infra:up
```

### 4. Database Migration
```bash
npm run prisma:migrate
npm run prisma:seed
```

### 5. Run the Application
Start the backend:
```bash
npm run dev
```

Start the frontend (in a separate terminal):
```bash
cd frontend
npm run dev
```

## 🔍 Monitoring
Access the Kafka UI at `http://localhost:8080` to monitor:
- Event streams on `raw-audio`, `transcripts`, and `agent-insights`.
- Consumer group performance for each agent.

## 📖 Documentation
For detailed technical architecture and protocol specifications, see [specifications.md](./specifications.md).

## 📄 License
This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.
