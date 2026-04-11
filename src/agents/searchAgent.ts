import { tavily } from '@tavily/core';
import { AGENT_PROMPTS } from '../prompts/agentTemplates';
import kafka from '../config/kafkaClient';
import logger from '../utils/logger';
import { sanitizeInput, validateOutput } from '../utils/guardrails';
import { contextStore } from '../services/contextStore';
import { createGeminiModel } from '../config/geminiConfig';
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY || '' });

export class SearchAgent {
    private consumer = kafka.consumer({ groupId: 'search-agent-group' });
    private producer = kafka.producer();

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

                    if (this.shouldTriggerSearch(transcript)) {
                        const insight = await this.performSearchAndAnalysis(sessionId, transcript);
                        if (sessionId && insight) {
                            await this.producer.send({
                                topic: 'agent-insights',
                                messages: [{
                                    key: sessionId,
                                    value: JSON.stringify({
                                        agentId: 'search-agent',
                                        category: 'News/Competitors',
                                        content: insight,
                                    }),
                                }],
                            });
                        }
                    }
                } catch (error) {
                    logger.error('search-agent: unhandled error processing message', {
                        error: error instanceof Error ? error.stack : error,
                    });
                }
            },
        });
    }

    private shouldTriggerSearch(text: string): boolean {
        return AGENT_PROMPTS.SEARCH_AGENT.triggerKeywords.some((kw) =>
            text.toLowerCase().includes(kw)
        );
    }

    private async performSearchAndAnalysis(sessionId: string | undefined, latestUtterance: string): Promise<string | null> {
        const safeInput = sanitizeInput('search-agent', latestUtterance);
        if (!safeInput) return null;

        const fullContext = sessionId
            ? contextStore.getFullContext(sessionId)
            : `[CONVERSATION SO FAR]\n${safeInput}`;

        try {
            const model = createGeminiModel();

            // 1. Generate a focused search query using full conversation context
            const queryResult = await model.generateContent([
                `You are assisting a salesperson. Based on the full conversation context below, generate a single precise web search query to find information that would help them right now.\n\n${fullContext}\n\n[LATEST UTTERANCE]\n${safeInput}\n\nRespond with only the search query, nothing else.`,
            ]);
            const query = queryResult.response.text().trim();

            // 2. Perform web search
            const searchResponse = await tvly.search(query, { searchDepth: 'basic', maxResults: 3 });

            // 3. Summarize with full context
            const webContext = JSON.stringify(searchResponse.results);
            const summaryResult = await model.generateContent([
                AGENT_PROMPTS.SEARCH_AGENT.system,
                fullContext,
                `[LATEST UTTERANCE]\n${safeInput}`,
                `[WEB SEARCH RESULTS]\n${webContext}`,
            ]);

            return validateOutput('search-agent', summaryResult.response.text());
        } catch (error) {
            logger.error('search-agent: pipeline error', {
                error: error instanceof Error ? error.stack : error,
            });
            return null;
        }
    }
}
