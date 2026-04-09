import 'dotenv/config'; // MUST be first — env vars needed by all subsequent module-level code

// ---------------------------------------------------------------------------
// Environment validation — fail fast before any module initialisation
// ---------------------------------------------------------------------------
if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is not set. Exiting.');
    process.exit(1);
}

import { initTracing } from './config/tracing';
initTracing(); // Initialize tracing before application imports
import { bootstrap, orchestrator } from './server';
import { salesCoachAgent, qaAgent } from './agents/coreAgents';
import { SearchAgent } from './agents/searchAgent';
import { setupKafkaTopics } from './services/kafkaOrchestrator';
import { prisma } from './config/prismaClient';
import logger from './utils/logger';

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down gracefully`);
    try {
        await orchestrator.shutdown();
        await prisma.$disconnect();
        logger.info('Shutdown complete');
    } catch (err) {
        logger.error('Error during shutdown', { error: err instanceof Error ? err.stack : err });
    }
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function start() {
    try {
        logger.info("Setting up Kafka topics...");
        await setupKafkaTopics();

        logger.info("Initializing Agent Consumers...");

        const searchAgent = new SearchAgent();

        // Initialize all agent consumer connections — allSettled so one failing
        // agent does not block the others from starting.
        const results = await Promise.allSettled([
            salesCoachAgent.init(),
            qaAgent.init(),
            searchAgent.init(),
        ]);

        const agentNames = ['salesCoachAgent', 'qaAgent', 'searchAgent'];
        results.forEach((result, idx) => {
            if (result.status === 'rejected') {
                logger.error(`Agent initialization failed`, {
                    agent: agentNames[idx],
                    error: result.reason instanceof Error ? result.reason.stack : result.reason,
                });
            }
        });

        logger.info("Starting Agent Consumers...");
        salesCoachAgent.start();
        qaAgent.start();
        searchAgent.start();

        logger.info("Initializing Express server and Ingestion Consumers...");
        await bootstrap();

    } catch (error) {
        logger.error("Failed to start application", {
            error: error instanceof Error ? error.stack : error,
        });
        process.exit(1);
    }
}

start();
