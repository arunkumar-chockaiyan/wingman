import { Kafka } from 'kafkajs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { tavily } from '@tavily/core';
import { AGENT_PROMPTS } from '../prompts/agentTemplates';

const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
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
                const sessionId = message.key?.toString();
                const { transcript } = JSON.parse(message.value?.toString() || '{}');

                if (this.shouldTriggerSearch(transcript)) {
                    const insight = await this.performSearchAndAnalysis(transcript);
                    if (sessionId && insight) {
                        await this.producer.send({
                            topic: 'agent-insights',
                            messages: [{
                                key: sessionId, value: JSON.stringify({
                                    agentId: 'search-agent',
                                    category: 'News/Competitors',
                                    content: insight
                                })
                            }]
                        });
                    }
                }
            },
        });
    }

    private shouldTriggerSearch(text: string): boolean {
        return AGENT_PROMPTS.SEARCH_AGENT.triggerKeywords.some(kw =>
            text.toLowerCase().includes(kw)
        );
    }

    private async performSearchAndAnalysis(transcript: string): Promise<string | null> {
        try {
            // 1. Generate search query using Gemini
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const queryResult = await model.generateContent([
                `Based on this transcript snippet, generate a single web search query to help a salesperson: "${transcript}"`
            ]);
            const query = queryResult.response.text().trim();

            // 2. Perform search
            const searchResponse = await tvly.search(query, { searchDepth: "basic", maxResults: 3 });

            // 3. Summarize with Gemini
            const context = JSON.stringify(searchResponse.results);
            const summaryResult = await model.generateContent([
                AGENT_PROMPTS.SEARCH_AGENT.system,
                `Context from Web: ${context}`,
                `Current Transcript: ${transcript}`
            ]);

            return summaryResult.response.text();
        } catch (error) {
            console.error("Search Agent Error:", error);
            return null;
        }
    }
}
