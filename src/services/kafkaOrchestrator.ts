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

  /**
   * Tracks the last cumulative partial transcript per session.
   * Vosk partial results are cumulative (each one contains the full partial text so far),
   * so we diff against the previous to broadcast only the new words.
   */
  private readonly lastPartials = new Map<string, string>();

  /**
   * Per-session idle timer: after 2s of no new audio chunks, send EOF to Vosk.
   * The timer is NOT reset for sessions in `sessionEnding`.
   */
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Sessions where end-call has been received. We still route Kafka chunks to the
   * existing Vosk WS (draining the Kafka buffer) but don't open new connections
   * or reset the idle timer.
   */
  private readonly sessionEnding = new Set<string>();

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

  /** 
   * Signal that a call session has ended.
   * Marks the session as "ending" so no new connections are opened for late Kafka chunks.
   * The existing Vosk WS stays open; the idle timer fires ~2s after the last chunk
   * and sends EOF to flush the final transcript.
   */
  closeVoskSession(sessionId: string): void {
    this.sessionEnding.add(sessionId);
    // Remove from readyPromises so the audio processor doesn't try to await a new config handshake
    this.voskReadyPromises.delete(sessionId);
    logger.info('[Vosk] Session ending — draining Kafka buffer, idle timer will send EOF', { sessionId });
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
    let msgCount = 0;
    await this.audioConsumer.run({
      eachMessage: async ({ message }) => {
        const sessionId = message.key?.toString();
        const chunk = message.value;
        if (!sessionId || !chunk) return;

        msgCount++;
        if (msgCount <= 3 || msgCount % 20 === 0) {
          logger.info('[AudioProcessor] Kafka chunk received', {
            sessionId,
            msgCount,
            chunkLength: chunk.length,
            isBuffer: Buffer.isBuffer(chunk),
            firstBytes: chunk.subarray(0, 8).toString('hex'),
          });
        }

        let ws = this.activeVoskSessions.get(sessionId);
        const isEnding = this.sessionEnding.has(sessionId);

        // Only open a new Vosk connection for active (not ending) sessions without one yet
        if (!ws && !isEnding) {
          ws = this.openVoskConnection(sessionId);
        } else if (!ws) {
          // Session is ending but WS was already cleaned up — drop this chunk
          logger.debug('[AudioProcessor] Dropping chunk for already-closed session', { sessionId });
          return;
        }

        // Wait until the config handshake is complete before sending audio.
        // If the Vosk connection failed, the promise rejects — catch it and
        // clean up so the consumer can continue processing other messages.
        const readyPromise = this.voskReadyPromises.get(sessionId);
        if (readyPromise) {
          try {
            await readyPromise;
          } catch (err) {
            logger.warn('[AudioProcessor] Vosk connection failed, dropping chunk', {
              sessionId,
              error: err,
            });
            this.activeVoskSessions.delete(sessionId);
            this.voskReadyPromises.delete(sessionId);
            return;
          }
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
          if (msgCount <= 3) {
            logger.info('[AudioProcessor] Sent chunk to Vosk', {
              sessionId,
              chunkLength: chunk.length,
            });
          }

          // Reset the idle timer for every chunk (including ending sessions).
          // end-call travels via Socket.IO directly while audio chunks go through
          // Kafka, so closeVoskSession() often runs BEFORE the last chunks are
          // consumed. Without resetting the timer here, EOF would never be sent
          // and Vosk would only emit partial results.
          const existing = this.idleTimers.get(sessionId);
          if (existing) clearTimeout(existing);
          const capturedWs = ws;
          const timer = setTimeout(async () => {
            this.idleTimers.delete(sessionId);
            if (capturedWs.readyState === WebSocket.OPEN) {
              logger.info('[AudioProcessor] Idle timeout — sending EOF to Vosk', { sessionId });
              capturedWs.send(JSON.stringify({ eof: 1 }));
            }
            // Full cleanup after EOF
            this.activeVoskSessions.delete(sessionId);
            this.sessionEnding.delete(sessionId);
            this.lastPartials.delete(sessionId);
          }, 2000);
          this.idleTimers.set(sessionId, timer);
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
    const voskUrl = process.env.VOSK_URL || 'ws://127.0.0.1:2700';
    const voskWs = new WebSocket(voskUrl);

    // Store immediately to prevent duplicate connections from concurrent messages
    this.activeVoskSessions.set(sessionId, voskWs);

    // Promise that resolves once the config message has been sent,
    // or rejects if the connection fails — preventing the audio consumer from hanging.
    const readyPromise = new Promise<void>((resolve, reject) => {
      voskWs.on('open', () => {
        logger.info('[AudioProcessor] Vosk connection opened', { sessionId });
        voskWs.send(JSON.stringify({ config: { sample_rate: VOSK_SAMPLE_RATE } }));
        resolve();
      });

      voskWs.on('error', (err) => {
        reject(err);
      });

      voskWs.on('close', () => {
        reject(new Error('Vosk WebSocket closed before open'));
      });
    });
    this.voskReadyPromises.set(sessionId, readyPromise);

    voskWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());

        if (response.partial) {
          // Track the latest partial silently — used to diff against final text
          this.lastPartials.set(sessionId, response.partial);
        }

        if (response.text && response.text.trim().length > 0) {
          // Final result fires on a speech pause — broadcast as a paragraph chunk
          logger.info('[Vosk] Paragraph transcript', { sessionId, text: response.text });
          await this.broadcastTranscript(sessionId, response.text.trim());
          this.lastPartials.delete(sessionId);
        }
      } catch (err) {
        logger.warn('[Vosk] Failed to parse message', { sessionId, error: err });
      }
    });

    voskWs.on('close', () => {
      this.activeVoskSessions.delete(sessionId);
      this.voskReadyPromises.delete(sessionId);
      this.lastPartials.delete(sessionId);
    });

    voskWs.on('error', (err) => {
      logger.error('[Vosk] WebSocket error', { sessionId, error: err });
    });

    logger.info('[AudioProcessor] Opening Vosk stream', { sessionId, url: voskUrl });
    return voskWs;
  }
}
