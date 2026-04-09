import { Kafka } from 'kafkajs';

/**
 * Shared Kafka instance — all producers and consumers in the app use this
 * single factory so they share broker configuration and avoid redundant
 * TCP connections to the same broker.
 */
const kafka = new Kafka({
    clientId: 'wingman',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

export default kafka;
