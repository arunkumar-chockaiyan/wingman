import { AGENT_PROMPTS } from '../prompts/agentTemplates';
import kafka from '../config/kafkaClient';
import logger from '../utils/logger';
import { sanitizeInput, validateOutput } from '../utils/guardrails';
import { contextStore } from '../services/contextStore';
import { createGeminiModel } from '../config/geminiConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentPrompt {
    system: string;
    triggerKeywords: string[];
}

// ---------------------------------------------------------------------------
// GenericAgent
// ---------------------------------------------------------------------------

export class GenericAgent {
    private consumer;
    private producer = kafka.producer();
    private prompt: AgentPrompt;
    private agentId: string;
    private category: string;

    constructor(agentId: string, category: string, prompt: AgentPrompt) {
        this.agentId = agentId;
        this.category = category;
        this.prompt = prompt;
        this.consumer = kafka.consumer({ groupId: `${agentId}-group` });
    }

    async init() {
        await this.consumer.connect();
        await this.producer.connect();
        await this.consumer.subscribe({ topic: 'transcripts', fromBeginning: false });
    }

    async start() {
        await this.consumer.run({
            eachMessage: async ({ message }) => {
                try {
                    const sessionId = message.key?.toString();
                    const { transcript } = JSON.parse(message.value?.toString() || '{}');

                    if (this.shouldTrigger(transcript)) {
                        const insight = await this.analyze(sessionId, transcript);
                        if (sessionId && insight) {
                            await this.producer.send({
                                topic: 'agent-insights',
                                messages: [{
                                    key: sessionId,
                                    value: JSON.stringify({
                                        agentId: this.agentId,
                                        category: this.category,
                                        content: insight,
                                    }),
                                }],
                            });
                        }
                    }
                } catch (error) {
                    logger.error(`${this.agentId}: unhandled error processing message`, {
                        agentId: this.agentId,
                        error: error instanceof Error ? error.stack : error,
                    });
                }
            },
        });
    }

    private shouldTrigger(text: string): boolean {
        return this.prompt.triggerKeywords.some((kw) =>
            text.toLowerCase().includes(kw)
        );
    }

    private async analyze(sessionId: string | undefined, latestUtterance: string): Promise<string | null> {
        const safeInput = sanitizeInput(this.agentId, latestUtterance);
        if (!safeInput) return null;

        const fullContext = sessionId ? contextStore.getFullContext(sessionId) : `[CONVERSATION SO FAR]\n${safeInput}`;

        try {
            const model = createGeminiModel();
            const result = await model.generateContent([
                this.prompt.system,
                fullContext,
                `[LATEST UTTERANCE]\n${safeInput}`,
            ]);
            return validateOutput(this.agentId, result.response.text());
        } catch (error) {
            logger.error(`${this.agentId}: Gemini API error`, {
                agentId: this.agentId,
                error: error instanceof Error ? error.stack : error,
            });
            return null;
        }
    }
}

// Instantiate specific agents
export const salesCoachAgent = new GenericAgent('sales-coach', 'Sales Feedback', AGENT_PROMPTS.SALES_COACH);
export const qaAgent = new GenericAgent('qa-agent', 'Answers', AGENT_PROMPTS.QA_AGENT);
