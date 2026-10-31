import { appUrl } from "../../lib/server/account-email";
import { deadLetteredMonitors, overdueChecks } from "../../lib/server/check-state";
import type { DbExecutor } from "../../lib/server/db/index";
import { childLogger } from "../../lib/server/logger";
import {
	clearOpsAlert,
	opsAlertsEnabled,
	raiseOpsAlert,
	reason,
	withTimeout,
} from "../../lib/server/ops-alert";

const log = childLogger("consumer");

/** Monitors a dead-letter alert names. The rest are on the admin page. */
const LISTED_MONITORS = 10;

const CHECKS_OVERDUE = { type: "monitor_checks_overdue", subject: "scheduler" } as const;
const DATABASE_UNREADABLE = { type: "monitor_checks_overdue", subject: "database" } as const;

/**
 * Watches the monitor worker from outside it: a worker that is down cannot log
 * that it stopped checking. A failed query alerts too, because a database this
 * process cannot read is one the monitor worker probably cannot use either. A
 * recovery clears the cooldown: the next outage is news, however soon it comes.
 */
export async function reportOverdueChecks(db: DbExecutor, timeoutMs?: number): Promise<void> {
	try {
		const { overdue, oldestDueAt } = await withTimeout(overdueChecks(db), timeoutMs);
		await clearOpsAlert(db, DATABASE_UNREADABLE, timeoutMs);
		if (overdue === 0) {
			await clearOpsAlert(db, CHECKS_OVERDUE, timeoutMs);
			return;
		}
		// Log alerts match on this event_type.
		log.error(
			{ event_type: "monitor_checks_overdue", overdue, oldest_due_at: oldestDueAt },
			"Monitors are not being checked",
		);
		await raiseOpsAlert(db, {
			...CHECKS_OVERDUE,
			title: "Monitors are not being checked",
			body: `${overdue} active monitors are past due, the oldest since ${oldestDueAt?.toISOString()}. Check that the monitor worker is running and can reach the database.`,
		});
	} catch (err) {
		log.error({ error: err }, "Overdue check query failed");
		await raiseOpsAlert(db, {
			...DATABASE_UNREADABLE,
			title: "Cannot tell whether monitors are being checked",
			body: `The notifier worker could not read the monitor table: ${reason(err)}`,
		});
	}
}

/**
 * Reports dead letter from the table rather than from the failure that entered it,
 * so one fault across every monitor is one message. The subject is the newest
 * entry into dead letter: a new failure, or a monitor that recovered and failed
 * again, alerts at once, and an unchanged set waits out the cooldown. The message
 * carries IDs only: names and check errors are customer text, and the admin page
 * shows them.
 */
export async function reportDeadLetters(db: DbExecutor, timeoutMs?: number): Promise<void> {
	if (!opsAlertsEnabled()) return;
	try {
		const monitors = await withTimeout(deadLetteredMonitors(db, LISTED_MONITORS), timeoutMs);
		const [newest] = monitors;
		if (!newest) return;

		const lines = monitors.map(
			(m) =>
				`- ${m.id}, organization ${m.organizationId}, since ${m.deadLetteredAt?.toISOString()}`,
		);
		if (newest.total > monitors.length) {
			lines.push(`- and ${newest.total - monitors.length} more`);
		}
		await raiseOpsAlert(db, {
			type: "monitor_dead_lettered",
			subject: `${newest.id}:${newest.deadLetteredAt?.toISOString()}`,
			title: `Dead-lettered monitors: ${newest.total}`,
			body: [
				`Checks of ${newest.total} monitors keep failing inside Uppity, not at their targets. They keep retrying.`,
				"",
				`Review them at ${appUrl}/admin/dead-letters`,
				"",
				...lines,
			].join("\n"),
		});
	} catch (err) {
		log.error({ error: err }, "Dead letter query failed");
	}
}
