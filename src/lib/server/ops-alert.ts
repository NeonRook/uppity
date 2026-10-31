/**
 * Alerts for the people running this instance, sent to destinations set in the
 * environment. Separate from NotificationService, which only reaches the channels
 * an organization configured and only knows how to describe a monitor to a customer.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { eq, sql } from "drizzle-orm";

import { OPS_ALERT_COOLDOWN_HOURS } from "#lib/constants/defaults.js";

import { truncate } from "../format";
import type { DbExecutor } from "./db/index";
import { opsAlertCooldown } from "./db/schema";
import { childLogger } from "./logger";
import { postJson } from "./notifications/http";
import { smtpFrom, smtpTransport } from "./smtp";

const TIMEOUT_MS = 10_000;
const COOLDOWN_MS = OPS_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000;
const DISCORD_DESCRIPTION_MAX = 4096;
const RED = 0xdc2626;

const log = childLogger("ops-alert");

export type OpsAlertType = "monitor_dead_lettered" | "monitor_checks_overdue";

export interface OpsAlert {
	type: OpsAlertType;
	/** What the alert is about. One cooldown runs per type and subject. */
	subject: string;
	/** Goes in the email subject. Like `body`, it must not carry customer text. */
	title: string;
	/** Plain text. Goes to the mail provider and Discord, so IDs and counts only. */
	body: string;
}

/** Last send per key in this process: the only cooldown left when the database is down. */
const sentAt = new Map<string, number>();

/**
 * The message of a failure, for logs and alert text: the logger writes an Error
 * object as `{}`. Drizzle wraps a failed query, and the cause says what went wrong.
 */
export function reason(err: unknown): string {
	const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
	return cause instanceof Error ? cause.message : String(cause);
}

export function withTimeout<T>(work: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
	const expired = sleep(ms, undefined, { ref: false }).then(() => {
		throw new Error(`Timed out after ${ms}ms`);
	});
	return Promise.race([work, expired]);
}

/** Takes the cooldown for `key`. False means the alert went out recently. */
async function claim(db: DbExecutor, key: string, timeoutMs?: number): Promise<boolean> {
	const last = sentAt.get(key);
	if (last !== undefined && Date.now() - last < COOLDOWN_MS) return false;
	sentAt.set(key, Date.now());

	try {
		const claimed = await withTimeout(
			db
				.insert(opsAlertCooldown)
				.values({ key })
				.onConflictDoUpdate({
					target: opsAlertCooldown.key,
					set: { sentAt: sql`NOW()` },
					where: sql`${opsAlertCooldown.sentAt} <= NOW() - make_interval(hours => ${OPS_ALERT_COOLDOWN_HOURS})`,
				})
				.returning({ key: opsAlertCooldown.key }),
			timeoutMs,
		);
		if (claimed.length === 0) sentAt.delete(key);
		return claimed.length > 0;
	} catch (error) {
		// The database failing is what some alerts report, so it must not silence them.
		log.warn({ key, error: reason(error) }, "Ops alert cooldown unavailable, using this process's");
		return true;
	}
}

async function release(db: DbExecutor, key: string, timeoutMs?: number): Promise<void> {
	sentAt.delete(key);
	await withTimeout(db.delete(opsAlertCooldown).where(eq(opsAlertCooldown.key, key)), timeoutMs);
}

async function sendEmail(to: string, { title, body }: OpsAlert): Promise<void> {
	if (!smtpTransport) throw new Error("SMTP not configured");
	await smtpTransport.sendMail({
		from: smtpFrom,
		to,
		subject: `[Uppity ops] ${title}`,
		text: body,
	});
}

async function sendDiscord(url: string, { title, body }: OpsAlert): Promise<void> {
	const embed = {
		title,
		description: truncate(body, DISCORD_DESCRIPTION_MAX),
		color: RED,
		timestamp: new Date().toISOString(),
	};
	const payload = { embeds: [embed], allowed_mentions: { parse: [] } };
	const result = await postJson(url, payload, "Discord API");
	// A fetch error can quote the URL, and the URL is the webhook's credential.
	if (!result.success) throw new Error(result.errorMessage?.replaceAll(url, "<webhook url>"));
}

const destinations = () => ({
	email: process.env.UPPITY_OPS_ALERT_EMAIL,
	webhook: process.env.UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL,
});

export function opsAlertsEnabled(): boolean {
	const { email, webhook } = destinations();
	return Boolean(email || webhook);
}

const cooldownKey = ({ type, subject }: Pick<OpsAlert, "type" | "subject">) => `${type}:${subject}`;

/**
 * Sends `alert` to the operator unless its cooldown is running. Never rejects and
 * makes one attempt per call, so a failure path can raise it without awaiting. An
 * alert no destination accepted gives its cooldown back, so the caller's next
 * raise tries again.
 */
export async function raiseOpsAlert(
	db: DbExecutor,
	alert: OpsAlert,
	timeoutMs?: number,
): Promise<void> {
	if (!opsAlertsEnabled()) return;
	const { email, webhook } = destinations();

	const key = cooldownKey(alert);
	try {
		if (!(await claim(db, key, timeoutMs))) return;

		const sends: Promise<void>[] = [];
		if (email) sends.push(withTimeout(sendEmail(email, alert), timeoutMs));
		if (webhook) sends.push(withTimeout(sendDiscord(webhook, alert), timeoutMs));

		const results = await Promise.allSettled(sends);
		const failed = results.filter((result) => result.status === "rejected");
		for (const failure of failed) {
			log.error({ key, error: reason(failure.reason) }, "Ops alert not delivered");
		}
		if (failed.length === sends.length) await release(db, key, timeoutMs);
	} catch (error) {
		log.error({ key, error: reason(error) }, "Ops alert failed");
	}
}

/** Ends a cooldown once its cause has gone, so the next outage alerts at once. Never rejects. */
export async function clearOpsAlert(
	db: DbExecutor,
	alert: Pick<OpsAlert, "type" | "subject">,
	timeoutMs?: number,
): Promise<void> {
	if (!opsAlertsEnabled()) return;
	const key = cooldownKey(alert);
	try {
		await release(db, key, timeoutMs);
	} catch (error) {
		log.warn({ key, error: reason(error) }, "Ops alert cooldown not cleared");
	}
}
