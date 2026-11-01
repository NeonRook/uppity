/**
 * OpenTelemetry for every long-lived process. entrypoint.sh loads this with `--import`, ahead of
 * the entry point, because the pino instrumentation has to be registered before pino is imported.
 * It does nothing unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */
import { SeverityNumber } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	BatchLogRecordProcessor,
	type LogRecordProcessor,
	type ReadWriteLogRecord,
} from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor, type Span, type SpanProcessor } from "@opentelemetry/sdk-trace";
import { register } from "import-in-the-middle/register-hooks.mjs";

import { deployment, REPOSITORY, SERVICE_NAMESPACE, type Deployment } from "./deployment.ts";

/** Logged on every watchdog pass. A rule in the backend fires when it stops arriving. */
export const HEARTBEAT_EVENT = "watchdog_heartbeat";

/**
 * The only log fields that leave the process. Everything else stays in stdout, because error
 * events can carry email addresses, client IPs and text customers typed.
 */
const EXPORTED_LOG_FIELDS = new Set([
	"context",
	"duration_ms",
	"error_type",
	"event_type",
	"monitor_id",
	"org_id",
	"overdue",
	"request_id",
	"service",
	"status",
	"undelivered",
]);

/** Passes on warnings, errors and the heartbeat, reduced to `EXPORTED_LOG_FIELDS`. */
export class OperatorLogProcessor implements LogRecordProcessor {
	readonly #next: LogRecordProcessor;

	constructor(next: LogRecordProcessor) {
		this.#next = next;
	}

	onEmit(...[record, context]: Parameters<LogRecordProcessor["onEmit"]>): void {
		if (!isOperatorSignal(record)) return;
		for (const field of Object.keys(record.attributes)) {
			if (!EXPORTED_LOG_FIELDS.has(field)) delete record.attributes[field];
		}
		this.#next.onEmit(record, context);
	}

	forceFlush(): Promise<void> {
		return this.#next.forceFlush();
	}

	shutdown(): Promise<void> {
		return this.#next.shutdown();
	}
}

function isOperatorSignal(record: ReadWriteLogRecord): boolean {
	return (
		(record.severityNumber ?? SeverityNumber.UNSPECIFIED) >= SeverityNumber.WARN ||
		record.attributes.event_type === HEARTBEAT_EVENT
	);
}

/** Kit records the full URL on its root span, and confirmation links carry tokens. `http.route` stays. */
export const redactSpanUrl: SpanProcessor = {
	onStart(span: Span) {
		if (span.attributes["http.url"]) span.setAttribute("http.url", "[redacted]");
	},
	onEnd: () => undefined,
	forceFlush: () => Promise.resolve(),
	shutdown: () => Promise.resolve(),
};

function deploymentResource({ environment, version, name, id, revision }: Deployment) {
	const attributes = {
		"service.name": process.env.SERVICE_NAME || "uppity",
		"service.namespace": SERVICE_NAMESPACE,
		"service.version": version,
		"deployment.environment.name": environment,
		"deployment.name": name,
		"deployment.id": id,
		"vcs.provider.name": REPOSITORY.provider,
		"vcs.owner.name": REPOSITORY.owner,
		"vcs.repository.name": REPOSITORY.name,
		"vcs.repository.url.full": REPOSITORY.url,
		"vcs.ref.head.name": name,
		"vcs.ref.head.revision": revision,
	};
	return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value));
}

function startTelemetry(): NodeSDK | null {
	if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return null;
	// Wrapping every module hides exports: SvelteKit's `hooks.reroute` comes back undefined.
	register({ include: ["pino"] });
	const sdk = new NodeSDK({
		// Host detection shells out, and the permission model denies child processes.
		autoDetectResources: false,
		resource: resourceFromAttributes(deploymentResource(deployment())),
		spanProcessors: [redactSpanUrl, new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
		logRecordProcessors: [
			new OperatorLogProcessor(new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })),
		],
		metricReaders: [],
		instrumentations: [new PinoInstrumentation()],
	});
	sdk.start();
	return sdk;
}

const sdk = startTelemetry();

/** Sends what is queued. Call before `process.exit`, which would drop it. */
export async function shutdownTelemetry(): Promise<void> {
	await sdk?.shutdown();
}
