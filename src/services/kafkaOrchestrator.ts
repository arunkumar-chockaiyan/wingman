import { Kafka, Producer, Consumer } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'wingman-orchestrator',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

export class Orchestrator {
  private producer: Producer;
  private audioConsumer: Consumer;
  private insightConsumer: Consumer;

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
}
