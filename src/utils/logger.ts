import winston from 'winston';
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

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        otelEnrichment(),
        process.env.NODE_ENV === 'production' ? json() : combine(colorize(), localFormat)
    ),
    transports: [
        new winston.transports.Console(),
    ],
});

export default logger;
