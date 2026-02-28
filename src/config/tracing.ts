import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { KafkaJsInstrumentation } from '@opentelemetry/instrumentation-kafkajs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import logger from '../utils/logger';

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: 'wingman-backend',
    }),
    traceExporter: new OTLPTraceExporter({
        // Jaeger's OTLP gRPC endpoint is 4317 by default
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    }),
    instrumentations: [
        new HttpInstrumentation(),
        new ExpressInstrumentation(),
        new KafkaJsInstrumentation(),
    ],
});

export const initTracing = () => {
    sdk.start();
    logger.info('OpenTelemetry SDK initialized successfully');

    process.on('SIGTERM', () => {
        sdk.shutdown()
            .then(() => logger.info('Tracing terminated'))
            .catch((error) => logger.error('Error terminating tracing', { error }))
            .finally(() => process.exit(0));
    });
};
