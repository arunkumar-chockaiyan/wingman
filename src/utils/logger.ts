import winston from 'winston';
import LokiTransport from 'winston-loki';
import { trace, context } from '@opentelemetry/api';

const { combine, timestamp, json, printf, colorize } = winston.format;

// Custom format for local development (pretty print)
const localFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});

// Enrichment middleware for OTel
const otelEnrichment = winston.format((info) => {
    const activeSpan = trace.getSpan(context.active());
    if (activeSpan) {
        const spanContext = activeSpan.spanContext();
        info.traceId = spanContext.traceId;
        info.spanId = spanContext.spanId;
    }
    return info;
});

const lokiHost = process.env.LOKI_HOST || 'http://localhost:3100';

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        otelEnrichment(),
        json()
    ),
    transports: [
        // Console transport with pretty-printing for dev
        new winston.transports.Console({
            format: combine(colorize(), localFormat),
        }),
        // Loki transport — pushes logs to Grafana Loki
        new LokiTransport({
            host: lokiHost,
            labels: { app: 'wingman-backend', qa: 'test' },
            json: true,
            batching: false,
            interval: 5,
            levelLabel: 'level',
            onConnectionError: (err: Error) => console.error('[Loki] Connection error:', err),
        } as any),
    ],
});

export default logger;
