import { sendDomainLapseNotice } from "../../lib/server/account-email";
import { wideEvent, type MaintenanceWideEvent } from "../../lib/server/logger";
import { recheckDomains } from "../../lib/server/services/status-page-domain.service";
import { db } from "../shared/db";

const SWEEP_INTERVAL_MS = 15 * 60_000;

/**
 * Runs `sweep` with `intervalMs` between runs, on its own timer. A sweep waits on outside DNS
 * servers, so nothing a monitor check depends on may wait for one.
 */
export function repeatInBackground(sweep: () => Promise<void>, intervalMs: number): void {
	const run = () => {
		void sweep().finally(() => setTimeout(run, intervalMs).unref());
	};
	setTimeout(run, intervalMs).unref();
}

async function sweepDomains(): Promise<void> {
	const event = wideEvent<MaintenanceWideEvent>("maintenance", "maintenance_job", "mnt");
	event.merge({ job_id: "custom-domain-recheck", job_name: "Custom Domain Recheck" });
	try {
		const { checked, unnotified } = await recheckDomains(db, sendDomainLapseNotice);
		event.set("records_processed", checked);
		if (unnotified > 0) throw new Error(`${unnotified} lapse notices were not delivered`);
		event.setSuccess();
	} catch (error) {
		event.setError(error);
	} finally {
		event.emit("maintenance");
	}
}

/** Keeps live custom domains checked, apart from the poll loop that runs monitor checks. */
export const startDomainRecheck = () => repeatInBackground(sweepDomains, SWEEP_INTERVAL_MS);
