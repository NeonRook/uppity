import { Polar } from "@polar-sh/sdk";

/**
 * Meter event names - these should match meters defined in Polar Dashboard.
 *
 * To set up meters in Polar:
 * 1. Go to Polar Dashboard > Products > Meters
 * 2. Create meters with these event names and count aggregation
 */
export const METER_EVENTS = {
	MONITOR_CREATED: "monitor_created",
	MONITOR_DELETED: "monitor_deleted",
	STATUS_PAGE_CREATED: "status_page_created",
	STATUS_PAGE_DELETED: "status_page_deleted",
	// Future: could add check_executed for usage-based billing on checks
} as const;

type MeterEventName = (typeof METER_EVENTS)[keyof typeof METER_EVENTS];

interface MeterEvent {
	name: MeterEventName;
	organizationId: string;
	metadata?: Record<string, string | number | boolean>;
}

/**
 * Service for reporting usage events to Polar meters.
 * This enables usage analytics and optional usage-based billing.
 *
 * Local limit checking remains the source of truth for enforcement.
 * Meter events are for analytics/billing purposes.
 */
export class MeterService {
	private client: Polar | null = null;
	private enabled = false;

	constructor() {
		const accessToken = process.env.POLAR_ACCESS_TOKEN;
		const selfHosted = process.env.SELF_HOSTED === "true";

		// Only enable meter reporting if:
		// 1. Not self-hosted (self-hosted doesn't need Polar)
		// 2. Polar access token is configured
		if (!selfHosted && accessToken) {
			this.client = new Polar({
				accessToken,
				server: import.meta.env.DEV ? "sandbox" : "production",
			});
			this.enabled = true;
		}
	}

	/**
	 * Reports a single event to Polar meters.
	 * Fails silently - meter reporting should never block operations.
	 */
	async reportEvent(event: MeterEvent): Promise<void> {
		if (!this.enabled || !this.client) return;

		try {
			await this.client.events.ingest({
				events: [
					{
						name: event.name,
						externalCustomerId: event.organizationId,
						metadata: event.metadata,
					},
				],
			});
		} catch (error) {
			// Log but don't throw - meter reporting is non-critical
			console.error("[MeterService] Failed to report event:", error);
		}
	}

	/**
	 * Reports multiple events in a batch.
	 */
	async reportEvents(events: MeterEvent[]): Promise<void> {
		if (!this.enabled || !this.client || events.length === 0) {
			return;
		}

		try {
			await this.client.events.ingest({
				events: events.map((e) => ({
					name: e.name,
					externalCustomerId: e.organizationId,
					metadata: e.metadata,
				})),
			});
		} catch (error) {
			console.error("[MeterService] Failed to report events:", error);
		}
	}

	// Convenience methods for specific events

	async monitorCreated(
		organizationId: string,
		monitorId: string,
		monitorType: string,
	): Promise<void> {
		await this.reportEvent({
			name: METER_EVENTS.MONITOR_CREATED,
			organizationId,
			metadata: {
				monitor_id: monitorId,
				monitor_type: monitorType,
			},
		});
	}

	async monitorDeleted(organizationId: string, monitorId: string): Promise<void> {
		await this.reportEvent({
			name: METER_EVENTS.MONITOR_DELETED,
			organizationId,
			metadata: {
				monitor_id: monitorId,
			},
		});
	}

	async statusPageCreated(organizationId: string, statusPageId: string): Promise<void> {
		await this.reportEvent({
			name: METER_EVENTS.STATUS_PAGE_CREATED,
			organizationId,
			metadata: {
				status_page_id: statusPageId,
			},
		});
	}

	async statusPageDeleted(organizationId: string, statusPageId: string): Promise<void> {
		await this.reportEvent({
			name: METER_EVENTS.STATUS_PAGE_DELETED,
			organizationId,
			metadata: {
				status_page_id: statusPageId,
			},
		});
	}
}

// Singleton instance
export const meterService = new MeterService();
