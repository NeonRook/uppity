import { appUrl } from "../../lib/server/account-email";
import { deadLetteredMonitors, overdueChecks } from "../../lib/server/check-state";
import type { DbExecutor } from "../../lib/server/db/index";
import { childLogger } from "../../lib/server/logger";
import { raiseOpsAlert } from "../../lib/server/ops-alert";

const log = childLogger("consumer");

/** Monitors a dead-letter alert names. The rest are on the admin page. */
const LISTED_MONITORS = 10;

/** Drizzle wraps a failed query; the cause says what went wrong. */
function reason(err: unknown): string {
	const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
	return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Watches the monitor worker from outside it: a worker that is down cannot log
 * that it stopped checking. A failed query alerts too, because a database this
 * process cannot read is one the monitor worker probably cannot use either.
 */
export async function reportOverdueChecks(db: DbExecutor): Promise<void> {
	try {
		const { overdue, oldestDueAt } = await overdueChecks(db);
		if (overdue === 0) return;
		// Log alerts match on this event_type.
		log.error(
			{ event_type: "monitor_checks_overdue", overdue, oldest_due_at: oldestDueAt },
			"Monitors are not being checked",
		);
		await raiseOpsAlert(db, {
			type: "monitor_checks_overdue",
			subject: "scheduler",
			title: "Monitors are not being checked",
			body: `${overdue} active monitors are past due, the oldest since ${oldestDueAt?.toISOString()}. Check that the monitor worker is running and can reach the database.`,
		});
	} catch (err) {
		log.error({ error: err }, "Overdue check query failed");
		await raiseOpsAlert(db, {
			type: "monitor_checks_overdue",
			subject: "database",
			title: "Cannot tell whether monitors are being checked",
			body: `The notifier worker could not read the monitor table: ${reason(err)}`,
		});
	}
}

/**
 * Reports dead letter from the table rather than from the failure that entered it,
 * so one fault across every monitor is one message. The subject is the newest
 * monitor: a new failure alerts at once, and an unchanged set waits out the cooldown.
 */
export async function reportDeadLetters(db: DbExecutor): Promise<void> {
	try {
		const monitors = await deadLetteredMonitors(db, LISTED_MONITORS);
		const [newest] = monitors;
		if (!newest) return;

		const lines = monitors.map(
			(m) =>
				`- ${m.name} (${m.id}, organization ${m.organizationId}), since ${m.deadLetteredAt?.toISOString()}: ${m.lastError}`,
		);
		if (newest.total > monitors.length) {
			lines.push(`- and ${newest.total - monitors.length} more`);
		}
		await raiseOpsAlert(db, {
			type: "monitor_dead_lettered",
			subject: newest.id,
			title: `Dead-lettered monitors: ${newest.total}`,
			body: [
				"Checks of these monitors keep failing inside Uppity, not at their targets. They keep retrying.",
				"",
				...lines,
				"",
				`Review them at ${appUrl}/admin/dead-letters`,
			].join("\n"),
		});
	} catch (err) {
		log.error({ error: err }, "Dead letter query failed");
	}
}
