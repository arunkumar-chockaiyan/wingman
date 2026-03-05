import { describe, it, expect } from 'vitest';
import { Kafka } from 'kafkajs';
import WebSocket from 'ws';
import http from 'http';

describe('Docker Compose Infrastructure', () => {

    // Helper to test HTTP endpoints with retries
    const testHttpEndpoint = async (url: string, retries = 5, delay = 2000): Promise<number> => {
        for (let i = 0; i < retries; i++) {
            try {
                const status = await new Promise<number>((resolve, reject) => {
                    const req = http.get(url, (res) => {
                        resolve(res.statusCode || 0);
                    });
                    req.on('error', (err) => {
                        reject(err);
                    });
                    req.setTimeout(2000, () => {
                        req.destroy();
                        reject(new Error('Timeout'));
                    });
                });
                return status;
            } catch (err) {
                if (i === retries - 1) throw err;
                await new Promise(r => setTimeout(r, delay));
            }
        }
        return 0;
    };

    describe('Kafka Broker', () => {
        it('should connect to Kafka', async () => {
            const kafka = new Kafka({
                clientId: 'test-client',
                brokers: ['127.0.0.1:9092'],
                retry: {
                    initialRetryTime: 1000,
                    retries: 10
                }
            });

            const admin = kafka.admin();
            try {
                await admin.connect();
                const topics = await admin.listTopics();
                expect(Array.isArray(topics)).toBe(true);
            } finally {
                await admin.disconnect();
            }
        }, 30000);
    });

    describe('Vosk Server', () => {
        it('should connect via WebSocket', () => {
            return new Promise<void>((resolve, reject) => {
                const connectWebSocket = (retries = 5, delay = 2000) => {
                    const ws = new WebSocket('ws://localhost:2700');

                    ws.on('open', () => {
                        expect(ws.readyState).toBe(WebSocket.OPEN);
                        ws.close();
                        resolve();
                    });

                    ws.on('error', (err) => {
                        if (retries === 0) {
                            reject(err);
                        } else {
                            setTimeout(() => connectWebSocket(retries - 1, delay), delay);
                        }
                    });
                };

                connectWebSocket();
            });
        }, 20000);
    });

    describe('Kafka UI', () => {
        it('should be reachable via HTTP', async () => {
            const statusCode = await testHttpEndpoint('http://localhost:8080', 10, 3000);
            expect(statusCode).toBe(200);
        }, 30000);
    });

    describe('Loki', () => {
        it('should be reachable via HTTP', async () => {
            const statusCode = await testHttpEndpoint('http://localhost:3100/ready', 10, 3000);
            expect(statusCode).toBe(200);
        }, 30000);
    });

    describe('Jaeger UI', () => {
        it('should be reachable via HTTP', async () => {
            const statusCode = await testHttpEndpoint('http://localhost:16686', 10, 3000);
            expect(statusCode).toBe(200);
        }, 30000);
    });

    describe('Grafana', () => {
        it('should be reachable via HTTP', async () => {
            const statusCode = await testHttpEndpoint('http://localhost:3000/api/health', 10, 3000);
            expect(statusCode).toBe(200);
        }, 30000);
    });
});
