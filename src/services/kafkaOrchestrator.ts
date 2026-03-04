import { Kafka, Producer, Consumer } from 'kafkajs';
import WebSocket from 'ws';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const VOSK_SAMPLE_RATE = 16_000;

const kafka = new Kafka({
  clientId: 'wingman-orchestrator',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

// ---------------------------------------------------------------------------
// Topic Bootstrap
// ---------------------------------------------------------------------------

const REQUIRED_TOPICS = ['raw-audio', 'transcripts', 'agent-insights'] as const;

export async function setupKafkaTopics(): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();

  try {
    const existing = await admin.listTopics();
    const missing = REQUIRED_TOPICS
      .filter((t) => !existing.includes(t))
      .map((topic) => ({ topic }));

    if (missing.length > 0) {
      logger.info('Creating missing Kafka topics', { topics: missing.map((t) => t.topic) });
      await admin.createTopics({ topics: missing });
    }
  } finally {
    await admin.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class Orchestrator {
  private readonly producer: Producer;
  private readonly audioConsumer: Consumer;
  private readonly insightConsumer: Consumer;
  private readonly transcriptConsumer: Consumer;

  /** Active WebSocket connections to the Vosk STT server, keyed by sessionId. */
  private readonly activeVoskSessions = new Map<string, WebSocket>();

  /** Resolves once the Vosk config handshake is complete for a given session. */
  private readonly voskReadyPromises = new Map<string, Promise<void>>();

  constructor() {
    this.producer = kafka.producer();
    this.audioConsumer = kafka.consumer({ groupId: 'audio-processors' });
    this.insightConsumer = kafka.consumer({ groupId: 'result-aggregators' });
    this.transcriptConsumer = kafka.consumer({ groupId: 'transcript-feed' });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async init(): Promise<void> {
    await this.producer.connect();
    await this.audioConsumer.connect();
    await this.insightConsumer.connect();
    await this.transcriptConsumer.connect();

    await this.audioConsumer.subscribe({ topic: 'raw-audio', fromBeginning: false });
    await this.insightConsumer.subscribe({ topic: 'agent-insights', fromBeginning: false });
    await this.transcriptConsumer.subscribe({ topic: 'transcripts', fromBeginning: false });
  }

  /** Gracefully close all Vosk WebSockets and disconnect Kafka clients. */
  async shutdown(): Promise<void> {
    // Close every active Vosk session
    for (const sessionId of this.activeVoskSessions.keys()) {
      this.closeVoskSession(sessionId);
    }

    await this.audioConsumer.disconnect();
    await this.insightConsumer.disconnect();
    await this.transcriptConsumer.disconnect();
    await this.producer.disconnect();

    logger.info('Orchestrator shut down cleanly');
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Enqueue a raw audio chunk onto the `raw-audio` Kafka topic. */
  async handleAudioChunk(sessionId: string, chunk: Buffer): Promise<void> {
    await this.producer.send({
      topic: 'raw-audio',
      messages: [{ key: sessionId, value: chunk }],
    });
  }

  /** Publish a finalised transcript segment for downstream agents. */
  async broadcastTranscript(sessionId: string, transcript: string): Promise<void> {
    await this.producer.send({
      topic: 'transcripts',
      messages: [
        { key: sessionId, value: JSON.stringify({ transcript, timestamp: Date.now() }) },
      ],
    });
  }

  /** Close the Vosk WebSocket for a session and clean up tracking maps. */
  closeVoskSession(sessionId: string): void {
    const ws = this.activeVoskSessions.get(sessionId);
    if (ws) {
      // Send EOF so Vosk can flush any remaining partial results
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ eof: 1 }));
      }
      ws.close();
      this.activeVoskSessions.delete(sessionId);
      this.voskReadyPromises.delete(sessionId);
      logger.info('[Vosk] Session closed', { sessionId });
    }
  }

  // -----------------------------------------------------------------------
  // Consumers
  // -----------------------------------------------------------------------

  /** Listen for agent insights and route them back to the specific client. */
  async startInsightListener(
    onInsight: (sessionId: string, insight: unknown) => void,
  ): Promise<void> {
    await this.insightConsumer.run({
      eachMessage: async ({ message }) => {
        const sessionId = message.key?.toString();
        if (!sessionId || !message.value) return;

        try {
          const content = JSON.parse(message.value.toString());
          onInsight(sessionId, content);
        } catch (err) {
          logger.warn('[InsightListener] Malformed message', { sessionId, error: err });
        }
      },
    });
  }

  /** Listen for transcripts and route them back to the specific client. */
  async startTranscriptListener(
    onTranscript: (sessionId: string, data: { transcript: string; timestamp: number }) => void,
  ): Promise<void> {
    await this.transcriptConsumer.run({
      eachMessage: async ({ message }) => {
        const sessionId = message.key?.toString();
        if (!sessionId || !message.value) return;

        try {
          const content = JSON.parse(message.value.toString());
          onTranscript(sessionId, content);
        } catch (err) {
          logger.warn('[TranscriptListener] Malformed message', { sessionId, error: err });
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // Audio Processor  (Kafka → Vosk STT)
  // -----------------------------------------------------------------------

  /** Consume raw-audio chunks from Kafka and stream them to Vosk for transcription. */
  async startAudioProcessor(): Promise<void> {
    await this.audioConsumer.run({
      eachMessage: async ({ message }) => {
        const sessionId = message.key?.toString();
        const chunk = message.value;
        if (!sessionId || !chunk) return;

        let ws = this.activeVoskSessions.get(sessionId);

        // First chunk for this session — open a new Vosk WebSocket
        if (!ws) {
          ws = this.openVoskConnection(sessionId);
        }

        // Wait until the config handshake is complete before sending audio
        const readyPromise = this.voskReadyPromises.get(sessionId);
        if (readyPromise) {
          await readyPromise;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        } else {
          logger.warn('[AudioProcessor] Vosk WS not open, dropping chunk', {
            sessionId,
            readyState: ws.readyState,
          });
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Open a WebSocket to Vosk, send the config handshake, and register event handlers. */
  private openVoskConnection(sessionId: string): WebSocket {
    const voskUrl = process.env.VOSK_URL || 'ws://localhost:2700';
    const voskWs = new WebSocket(voskUrl);

    // Store immediately to prevent duplicate connections from concurrent messages
    this.activeVoskSessions.set(sessionId, voskWs);

    // Promise that resolves once the config message has been sent
    const readyPromise = new Promise<void>((resolve) => {
      voskWs.on('open', () => {
        logger.info('[AudioProcessor] Vosk connection opened', { sessionId });
        voskWs.send(JSON.stringify({ config: { sample_rate: VOSK_SAMPLE_RATE } }));
        resolve();
      });
    });
    this.voskReadyPromises.set(sessionId, readyPromise);

    voskWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());

        if (response.text && response.text.trim().length > 0) {
          logger.info('[Vosk] Final transcript', { sessionId, text: response.text });
          await this.broadcastTranscript(sessionId, response.text);
        }
      } catch (err) {
        logger.warn('[Vosk] Failed to parse message', { sessionId, error: err });
      }
    });

    voskWs.on('close', () => {
      this.activeVoskSessions.delete(sessionId);
      this.voskReadyPromises.delete(sessionId);
    });

    voskWs.on('error', (err) => {
      logger.error('[Vosk] WebSocket error', { sessionId, error: err });
    });

    logger.info('[AudioProcessor] Opening Vosk stream', { sessionId, url: voskUrl });
    return voskWs;
  }
}
