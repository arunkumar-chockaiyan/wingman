import 'dotenv/config'; // Ensure environment variables are loaded first
import { bootstrap } from './server';
import { salesCoachAgent, qaAgent } from './agents/coreAgents';
import { SearchAgent } from './agents/searchAgent';
import { setupKafkaTopics } from './services/kafkaOrchestrator';

async function start() {
    try {
        console.log("Setting up Kafka topics...");
        await setupKafkaTopics();

        console.log("Initializing Agent Consumers...");

        const searchAgent = new SearchAgent();

        // Initialize all agent consumer connections
        await Promise.all([
            salesCoachAgent.init(),
            qaAgent.init(),
            searchAgent.init()
        ]);

        console.log("Starting Agent Consumers...");
        // Start processing messages
        salesCoachAgent.start();
        qaAgent.start();
        searchAgent.start();

        console.log("Initializing Express server and Ingestion Consumers...");
        // Start the web server and its specific Kafka consumers
        await bootstrap();

    } catch (error) {
        console.error("Failed to start application:", error);
        process.exit(1);
    }
}

start();
