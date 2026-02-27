import { Kafka, Producer, Consumer } from 'kafkajs';
import WebSocket from 'ws';

const kafka = new Kafka({
  clientId: 'wingman-orchestrator',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

export async function setupKafkaTopics() {
  const admin = kafka.admin();
  await admin.connect();

  // Get existing topics
  const existingTopics = await admin.listTopics();
  const requiredTopics = ['raw-audio', 'transcripts', 'agent-insights'];

  // Find topics that don't exist yet
  const topicsToCreate = requiredTopics
    .filter(topic => !existingTopics.includes(topic))
    .map(topic => ({ topic }));

  if (topicsToCreate.length > 0) {
    console.log('Creating missing Kafka topics:', topicsToCreate.map(t => t.topic));
    await admin.createTopics({ topics: topicsToCreate });
  }

  await admin.disconnect();
}

export class Orchestrator {
  private producer: Producer;
  private audioConsumer: Consumer;
  private insightConsumer: Consumer;
  private activeVoskSessions: Map<string, WebSocket> = new Map();


  constructor() {
    this.producer = kafka.producer();
    this.audioConsumer = kafka.consumer({ groupId: 'audio-processors' });
    this.insightConsumer = kafka.consumer({ groupId: 'result-aggregators' });
  }

  async init() {
    await this.producer.connect();
    await this.audioConsumer.connect();
    await this.insightConsumer.connect();

    // Subscribe to incoming raw audio chunks
    await this.audioConsumer.subscribe({ topic: 'raw-audio', fromBeginning: false });

    // Subscribe to processed insights from various agents
    await this.insightConsumer.subscribe({ topic: 'agent-insights', fromBeginning: false });
  }

  /**
   * Routes raw audio chunks to the processing pipeline
   */
  async handleAudioChunk(sessionId: string, chunk: Buffer) {
    await this.producer.send({
      topic: 'raw-audio',
      messages: [{ key: sessionId, value: chunk }]
    });
  }

  /**
   * Broadcasts a final transcript segment for agents to consume
   */
  async broadcastTranscript(sessionId: string, transcript: string) {
    await this.producer.send({
      topic: 'transcripts',
      messages: [{ key: sessionId, value: JSON.stringify({ transcript, timestamp: Date.now() }) }]
    });
  }

  /**
   * Listens for agent insights and routes them back to the specific client
   */
  async startInsightListener(onInsight: (sessionId: string, insight: any) => void) {
    await this.insightConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const sessionId = message.key?.toString();
        const content = JSON.parse(message.value?.toString() || '{}');
        if (sessionId) {
          onInsight(sessionId, content);
        }
      },
    });
  }

  /**
   * Starts processing raw audio chunks (e.g., streaming to STT provider)
   */
  async startAudioProcessor() {
    await this.audioConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const sessionId = message.key?.toString();
        const chunk = message.value;

        if (sessionId && chunk) {
          let ws = this.activeVoskSessions.get(sessionId);

          if (!ws) {
            console.log(`[Audio Processor] Opening Vosk stream for session: ${sessionId}`);
            ws = new WebSocket('ws://localhost:2700');

            ws.on('message', async (data) => {
              const response = JSON.parse(data.toString());
              // Vosk returns { text: "final transcript" } for complete sentences
              if (response.text && response.text.trim().length > 0) {
                console.log(`[Vosk] Final Transcript for ${sessionId}: ${response.text}`);
                await this.broadcastTranscript(sessionId, response.text);
              }
            });

            ws.on('close', () => {
              this.activeVoskSessions.delete(sessionId);
            });

            ws.on('error', (err) => {
              console.error(`[Vosk Error] Session ${sessionId}:`, err);
            });

            this.activeVoskSessions.set(sessionId, ws);
          }

          // Buffer until the connection is open
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
          } else if (ws.readyState === WebSocket.CONNECTING) {
            ws.once('open', () => ws?.send(chunk));
          }
        }
      }
    });
  }
}
