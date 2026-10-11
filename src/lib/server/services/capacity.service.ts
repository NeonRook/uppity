import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { applyCapacityBlocks, DEFAULT_PLAN_ID, isSelfHosted, PLANS } from "#lib/constants/plans.js";
import { member, organization, user } from "#lib/server/db/auth-schema.js";
import type { Db, DbExecutor } from "#lib/server/db/index.js";
import { monitor, subscription, type Subscription } from "#lib/server/db/schema.js";
import type { CapacityNoticeKind } from "#lib/types/plans.js";

/** How long an organization may stay above its ceiling before monitors are paused. */
export const GRACE_PERIOD_DAYS = 14;

const DAY_MS = 86_400_000;

const NOTICE_ORDER: readonly CapacityNoticeKind[] = ["over", "week", "day", "paused"];

/** Members who receive notices: the roles that can change the plan or buy blocks. */
const NOTICE_ROLES = ["owner", "admin"];

/** A notice about to be sent. Warnings name the monitors a pause would take. */
export type CapacityNotice =
	| {
			kind: "over" | "week" | "day";
			organizationName: string;
			active: number;
			ceiling: number;
			pauseAt: Date;
			toPause: string[];
	  }
	| { kind: "paused"; organizationName: string; ceiling: number; paused: string[] };

/** Delivers a notice or throws. Nothing is recorded or paused until it returns. */
export type SendCapacityNotice = (to: string[], notice: CapacityNotice) => Promise<void>;

/** The monitor ceiling a subscription pays for, or null when nothing caps it. */
export function ceilingOf(sub: Pick<Subscription, "planId" | "blocks">): number | null {
	if (isSelfHosted()) return null;
	const plan = PLANS[sub.planId] ?? PLANS[DEFAULT_PLAN_ID];
	const { monitors } = applyCapacityBlocks(plan, sub.blocks);
	return monitors === -1 ? null : monitors;
}

/** When a grace period that started at `since` runs out. */
export function pauseDate(since: Date): Date {
	return new Date(since.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
}

async function activeMonitorCount(executor: DbExecutor, organizationId: string): Promise<number> {
	const [row] = await executor
		.select({ count: count() })
		.from(monitor)
		.where(and(eq(monitor.organizationId, organizationId), eq(monitor.active, true)));
	return row?.count ?? 0;
}

/** The newest active monitors, which are the ones a pause takes. */
async function newestActive(
	executor: DbExecutor,
	organizationId: string,
	limit: number,
): Promise<{ id: string; name: string }[]> {
	return executor
		.select({ id: monitor.id, name: monitor.name })
		.from(monitor)
		.where(and(eq(monitor.organizationId, organizationId), eq(monitor.active, true)))
		.orderBy(desc(monitor.createdAt), desc(monitor.id))
		.limit(limit);
}

async function clearClock(executor: DbExecutor, organizationId: string): Promise<boolean> {
	const cleared = await executor
		.update(subscription)
		.set({ overCapacitySince: null, capacityNotice: null, capacityNoticedAt: null })
		.where(
			and(
				eq(subscription.organizationId, organizationId),
				isNotNull(subscription.overCapacitySince),
			),
		)
		.returning({ id: subscription.id });
	return cleared.length > 0;
}

/**
 * Clears the grace clock when the organization is back within its ceiling. Runs after a
 * pause or delete; never resumes anything, so a slot the customer frees stays theirs.
 */
export async function clearIfWithinCeiling(db: DbExecutor, organizationId: string): Promise<void> {
	const [sub] = await db
		.select()
		.from(subscription)
		.where(eq(subscription.organizationId, organizationId));
	if (!sub?.overCapacitySince) return;

	const ceiling = ceilingOf(sub);
	if (ceiling === null || (await activeMonitorCount(db, organizationId)) <= ceiling) {
		await clearClock(db, organizationId);
	}
}

/**
 * Resumes capacity-paused monitors after the ceiling rose from `before` to `after`, oldest
 * first. Takes no more than the rise: room the customer made by pausing or deleting stays
 * theirs. Holds the subscription row like `takeMonitorSlot`, so a concurrent resume cannot
 * count the same room. Returns how many resumed.
 */
export async function resumeAfterRaise(
	db: Db,
	organizationId: string,
	before: number | null,
	after: number | null,
): Promise<number> {
	if (before === null || (after !== null && after <= before)) return 0;

	return db.transaction(async (tx) => {
		await tx
			.select({ id: subscription.id })
			.from(subscription)
			.where(eq(subscription.organizationId, organizationId))
			.for("update");

		const take =
			after === null
				? Number.MAX_SAFE_INTEGER
				: Math.min(after - before, after - (await activeMonitorCount(tx, organizationId)));
		if (take <= 0) return 0;

		const paused = tx
			.select({ id: monitor.id })
			.from(monitor)
			.where(and(eq(monitor.organizationId, organizationId), isNotNull(monitor.capacityPausedAt)))
			.orderBy(asc(monitor.createdAt), asc(monitor.id))
			.limit(take);

		const resumed = await tx
			.update(monitor)
			.set({
				active: true,
				capacityPausedAt: null,
				updatedAt: new Date(),
				nextCheckAt: sql`NOW()`,
				checkRetryCount: 0,
				checkLastError: null,
				checkBackoffUntil: null,
			})
			.where(inArray(monitor.id, paused))
			.returning({ id: monitor.id });

		await clearIfWithinCeiling(tx, organizationId);
		return resumed.length;
	});
}

async function noticeRecipients(db: Db, organizationId: string): Promise<string[]> {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, organizationId), inArray(member.role, NOTICE_ROLES)));
	return rows.map((row) => row.email);
}

/** The warning due `elapsed` milliseconds into the grace period. */
function warningDue(elapsed: number): "over" | "week" | "day" {
	if (elapsed >= (GRACE_PERIOD_DAYS - 1) * DAY_MS) return "day";
	if (elapsed >= (GRACE_PERIOD_DAYS - 7) * DAY_MS) return "week";
	return "over";
}

function rank(kind: CapacityNoticeKind | null): number {
	return kind === null ? -1 : NOTICE_ORDER.indexOf(kind);
}

export interface CapacityGraceResult {
	organizations_over: number;
	clocks_started: number;
	clocks_cleared: number;
	notices_sent: number;
	monitors_paused: number;
	/** One entry per organization the pass could not finish, by id. */
	failures: string[];
}

/**
 * One pass of the over-capacity grace period across every capped organization.
 *
 * Starts the clock when an organization goes over, sends the warning due at its point in
 * the period, and pauses the newest active monitors once the period has run out. Each
 * notice is delivered before it is recorded, and the pause waits a full day after the
 * last warning was actually delivered, so an email outage delays enforcement instead of
 * pausing without notice. One organization failing does not stop the others.
 */
export async function runCapacityGrace(
	db: Db,
	send: SendCapacityNotice,
	now: Date = new Date(),
): Promise<CapacityGraceResult> {
	const result: CapacityGraceResult = {
		organizations_over: 0,
		clocks_started: 0,
		clocks_cleared: 0,
		notices_sent: 0,
		monitors_paused: 0,
		failures: [],
	};
	if (isSelfHosted()) return result;

	const rows = await db
		.select({
			sub: subscription,
			organizationName: organization.name,
			active:
				sql<number>`(select count(*) from ${monitor} where ${monitor.organizationId} = ${subscription.organizationId} and ${monitor.active})`.mapWith(
					Number,
				),
		})
		.from(subscription)
		.innerJoin(organization, eq(organization.id, subscription.organizationId));

	for (const { sub, organizationName, active } of rows) {
		const { organizationId } = sub;
		const ceiling = ceilingOf(sub);

		if (ceiling === null || active <= ceiling) {
			if (sub.overCapacitySince && (await clearClock(db, organizationId))) {
				result.clocks_cleared++;
			}
			continue;
		}

		result.organizations_over++;
		try {
			let since = sub.overCapacitySince;
			if (!since) {
				since = now;
				await db
					.update(subscription)
					.set({ overCapacitySince: now, capacityNotice: null, capacityNoticedAt: null })
					.where(eq(subscription.id, sub.id));
				result.clocks_started++;
			}

			const excess = active - ceiling;
			const pauseAt = pauseDate(since);
			const due = warningDue(now.getTime() - since.getTime());
			const record = (kind: CapacityNoticeKind) =>
				db
					.update(subscription)
					.set({ capacityNotice: kind, capacityNoticedAt: now })
					.where(eq(subscription.id, sub.id));

			if (rank(sub.capacityNotice) < rank(due)) {
				const toPause = await newestActive(db, organizationId, excess);
				await send(await noticeRecipients(db, organizationId), {
					kind: due,
					organizationName,
					active,
					ceiling,
					pauseAt,
					toPause: toPause.map((m) => m.name),
				});
				await record(due);
				result.notices_sent++;
				continue;
			}

			const finalWarningAt = sub.capacityNoticedAt?.getTime() ?? Infinity;
			const enforce =
				sub.capacityNotice === "day" && now >= pauseAt && now.getTime() >= finalWarningAt + DAY_MS;
			if (!enforce) continue;

			const toPause = await newestActive(db, organizationId, excess);
			await send(await noticeRecipients(db, organizationId), {
				kind: "paused",
				organizationName,
				ceiling,
				paused: toPause.map((m) => m.name),
			});
			const paused = await db
				.update(monitor)
				.set({ active: false, capacityPausedAt: now, updatedAt: now })
				.where(
					and(
						inArray(
							monitor.id,
							toPause.map((m) => m.id),
						),
						eq(monitor.active, true),
					),
				)
				.returning({ id: monitor.id });
			await record("paused");
			result.notices_sent++;
			result.monitors_paused += paused.length;
		} catch (error) {
			result.failures.push(
				`${organizationId}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return result;
}
