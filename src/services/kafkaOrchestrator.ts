import { Producer, Consumer } from 'kafkajs';
import WebSocket from 'ws';
import kafka from '../config/kafkaClient';
import logger from '../utils/logger';
import { redactPII } from '../utils/guardrails';
import { contextStore } from './contextStore';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const VOSK_SAMPLE_RATE = 16_000;

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

  /** Pending delayed-close timeouts, keyed by sessionId — tracked so they can be cancelled on shutdown. */
  private readonly voskCleanupTimeouts = new Map<string, NodeJS.Timeout>();

  /** Callback invoked with partial (in-progress) transcript updates directly from Vosk. */
  private partialTranscriptCallback?: (sessionId: string, partial: string) => void;

  /** Tracks the word count at the last partial emit per session, for 10-word throttling. */
  private readonly partialWordCounts = new Map<string, number>();

  private static readonly PARTIAL_WORD_THRESHOLD = 10;

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
    // Cancel all pending delayed-close timers and close WebSockets immediately
    for (const sessionId of this.activeVoskSessions.keys()) {
      const pending = this.voskCleanupTimeouts.get(sessionId);
      if (pending) {
        clearTimeout(pending);
        this.voskCleanupTimeouts.delete(sessionId);
      }
      const ws = this.activeVoskSessions.get(sessionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.activeVoskSessions.clear();

    await this.audioConsumer.disconnect();
    await this.insightConsumer.disconnect();
    await this.transcriptConsumer.disconnect();
    await this.producer.disconnect();

    logger.info('Orchestrator shut down cleanly');
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Register a callback to receive partial (in-progress) transcript updates directly from Vosk. */
  onPartialTranscript(cb: (sessionId: string, partial: string) => void): void {
    this.partialTranscriptCallback = cb;
  }

  /** Enqueue a raw audio chunk onto the `raw-audio` Kafka topic. */
  async handleAudioChunk(sessionId: string, chunk: Buffer): Promise<void> {
    await this.producer.send({
      topic: 'raw-audio',
      messages: [{ key: sessionId, value: chunk }],
    });
  }

  /** Publish a finalised transcript segment for downstream agents. */
  async broadcastTranscript(sessionId: string, transcript: string): Promise<void> {
    const redacted = redactPII(transcript);

    // Append to context store — agents will read full context from there
    const utterCount = contextStore.appendTranscript(sessionId, redacted);

    await this.producer.send({
      topic: 'transcripts',
      messages: [
        { key: sessionId, value: JSON.stringify({ transcript: redacted, timestamp: Date.now(), utterCount }) },
      ],
    });
  }

  /**
   * Signal that a call session has ended.
   * Sends the Vosk EOF marker then schedules the WebSocket to close after
   * a delay so that any final partial transcript can be received.
   */
  closeVoskSession(sessionId: string): void {
    const ws = this.activeVoskSessions.get(sessionId);
    if (!ws) return;

    // Cancel any previously scheduled close for this session
    const existing = this.voskCleanupTimeouts.get(sessionId);
    if (existing) clearTimeout(existing);

    if (ws.readyState === WebSocket.OPEN) {
      logger.info('[Vosk] Sending EOF', { sessionId });
      ws.send('{"eof" : 1}'); // Vosk requires this exact string
    }

    // Delay closing to give Vosk time to flush the final transcript (~10 s)
    const timeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        logger.info('[Vosk] Closing WebSocket after delay', { sessionId });
        ws.close();
      }
      logger.info('[Vosk] Removing active Vosk session', { sessionId });
      this.activeVoskSessions.delete(sessionId);
      this.voskCleanupTimeouts.delete(sessionId);
    }, 15_000);

    this.voskCleanupTimeouts.set(sessionId, timeout);
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

        if (!ws) {
          try {
            ws = await this.openVoskConnection(sessionId);
            this.activeVoskSessions.set(sessionId, ws);
          } catch (err) {
            logger.error('[AudioProcessor] Failed to open Vosk connection', { sessionId, err });
            return;
          }
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        } else {
          logger.warn('[AudioProcessor] Dropped chunk, WS not open', { sessionId });
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Open a WebSocket to Vosk, send the config handshake, and register event handlers. */
  private async openVoskConnection(sessionId: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const voskUrl = process.env.VOSK_URL || 'ws://127.0.0.1:2700';
      logger.info('[Vosk] Initiating connection', { sessionId, url: voskUrl });

      const ws = new WebSocket(voskUrl);

      ws.on('open', () => {
        logger.info('[Vosk] Connection opened, sending config', { sessionId });
        ws.send(JSON.stringify({ config: { sample_rate: VOSK_SAMPLE_RATE } }));
        resolve(ws);
      });

      ws.on('message', async (data) => {
        try {
          const response = JSON.parse(data.toString());

          if (response.partial && response.partial.trim().length > 0) {
            const wordCount = response.partial.trim().split(/\s+/).length;
            const lastCount = this.partialWordCounts.get(sessionId) ?? 0;

            if (wordCount - lastCount >= Orchestrator.PARTIAL_WORD_THRESHOLD) {
              this.partialWordCounts.set(sessionId, wordCount);
              this.partialTranscriptCallback?.(sessionId, response.partial.trim());
            }
          }

          if (response.text && response.text.trim().length > 0) {
            logger.info('[Vosk] Final transcript received', { sessionId, text: response.text });
            // Reset partial word count — this utterance is complete
            this.partialWordCounts.delete(sessionId);
            // Flush any un-throttled partial as the final before broadcasting
            this.partialTranscriptCallback?.(sessionId, response.text.trim());
            await this.broadcastTranscript(sessionId, response.text.trim());
          }
        } catch (err) {
          logger.warn('[Vosk] Failed to parse message', { sessionId, error: err });
        }
      });

      ws.on('close', () => {
        logger.info('[Vosk] Connection closed', { sessionId });
        this.activeVoskSessions.delete(sessionId);
        this.partialWordCounts.delete(sessionId);
        contextStore.cleanup(sessionId);
      });

      ws.on('error', (err) => {
        logger.error('[Vosk] Connection error', { sessionId, error: err });
        reject(err);
      });
    });
  }
}
