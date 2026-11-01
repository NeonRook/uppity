import { SeverityNumber } from "@opentelemetry/api";
import {
	InMemoryLogRecordExporter,
	LoggerProvider,
	SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { describe, expect, it } from "vitest";

import { HEARTBEAT_EVENT, OperatorLogProcessor } from "./telemetry";

type Emitted = Parameters<ReturnType<LoggerProvider["getLogger"]>["emit"]>[0];

async function exportedBy(...records: Emitted[]) {
	const exporter = new InMemoryLogRecordExporter();
	const processor = new OperatorLogProcessor(new SimpleLogRecordProcessor({ exporter }));
	const provider = new LoggerProvider({ processors: [processor] });
	const logger = provider.getLogger("test");
	for (const record of records) logger.emit(record);
	await provider.forceFlush();
	return exporter.getFinishedLogRecords();
}

describe("OperatorLogProcessor", () => {
	it("keeps only allowlisted fields", async () => {
		const [record] = await exportedBy({
			severityNumber: SeverityNumber.ERROR,
			attributes: {
				event_type: "http_request",
				org_id: "org_1",
				user_email: "a@example.com",
				client_ip: "203.0.113.1",
				monitor_name: "Checkout",
				check_error: "customer text",
				error_message: "customer text",
				error_stack: "customer text",
			},
		});
		expect(record.attributes).toEqual({ event_type: "http_request", org_id: "org_1" });
	});

	it("drops routine records and passes the heartbeat", async () => {
		const records = await exportedBy(
			{ severityNumber: SeverityNumber.INFO, attributes: { event_type: "monitor_check" } },
			{ severityNumber: SeverityNumber.INFO, attributes: { event_type: HEARTBEAT_EVENT } },
		);
		expect(records.map((record) => record.attributes.event_type)).toEqual([HEARTBEAT_EVENT]);
	});
});
