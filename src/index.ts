import { initTracing } from './config/tracing';
initTracing(); // Initialize tracing before any other imports

import 'dotenv/config'; // Ensure environment variables are loaded first
import { bootstrap } from './server';
import { salesCoachAgent, qaAgent } from './agents/coreAgents';
import { SearchAgent } from './agents/searchAgent';
import { setupKafkaTopics } from './services/kafkaOrchestrator';
import logger from './utils/logger';

async function start() {
    try {
        logger.info("Setting up Kafka topics...");
        await setupKafkaTopics();

        logger.info("Initializing Agent Consumers...");

        const searchAgent = new SearchAgent();

        // Initialize all agent consumer connections
        await Promise.all([
            salesCoachAgent.init(),
            qaAgent.init(),
            searchAgent.init()
        ]);

        logger.info("Starting Agent Consumers...");
        // Start processing messages
        salesCoachAgent.start();
        qaAgent.start();
        searchAgent.start();

        logger.info("Initializing Express server and Ingestion Consumers...");
        // Start the web server and its specific Kafka consumers
        await bootstrap();

    } catch (error) {
        logger.error("Failed to start application", { error });
        process.exit(1);
    }
}

start();
