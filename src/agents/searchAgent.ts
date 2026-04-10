import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { tavily } from '@tavily/core';
import { AGENT_PROMPTS } from '../prompts/agentTemplates';
import kafka from '../config/kafkaClient';
import logger from '../utils/logger';
import { sanitizeInput, validateOutput } from '../utils/guardrails';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
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
                        const insight = await this.performSearchAndAnalysis(transcript);
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

    private async performSearchAndAnalysis(transcript: string): Promise<string | null> {
        const safeInput = sanitizeInput('search-agent', transcript);
        if (!safeInput) return null;

        try {
            const model = genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                ],
                generationConfig: { maxOutputTokens: 300 },
            });

            // 1. Generate search query using Gemini
            const queryResult = await model.generateContent([
                `Based on this transcript snippet, generate a single web search query to help a salesperson: "${safeInput}"`,
            ]);
            const query = queryResult.response.text().trim();

            // 2. Perform web search
            const searchResponse = await tvly.search(query, { searchDepth: 'basic', maxResults: 3 });

            // 3. Summarize with Gemini
            const context = JSON.stringify(searchResponse.results);
            const summaryResult = await model.generateContent([
                AGENT_PROMPTS.SEARCH_AGENT.system,
                `Context from Web: ${context}`,
                `Current Transcript: ${safeInput}`,
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
