import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import type { Db } from "../../lib/server/db/index";
import {
	incident,
	incidentMonitor,
	monitorNotificationChannel,
	monitorStatus,
	notificationChannel,
	notificationEvent,
	notificationLog,
	statusPage,
	statusPageMonitor,
	statusPageSubscriber,
} from "../../lib/server/db/schema";
import { NotificationService } from "../../lib/server/notifications/service";
import { EmailChannelService } from "../../lib/server/services/email-channel.service";
import { test } from "../../lib/server/test/fixture";
import { seedMonitor, seedOrg } from "../../lib/server/test/seed";
import {
	ALERTS,
	ALERT_RETRY_DELAYS_MS,
	claimPendingEvent,
	CONFIRMATIONS,
	processBacklog,
	processOne,
	RETRIES,
} from "./processor";

const sendMail = vi.hoisted(() => vi.fn());
const dnsLookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:dns/promises")>()),
	lookup: dnsLookup,
}));
vi.mock("../../lib/server/smtp", () => ({
	smtpFrom: "alerts@example.com",
	smtpTransport: { sendMail },
}));

const stubEvent = () =>
	({
		set: () => {},
		merge: () => {},
		emit: () => {},
		setSuccess: () => {},
		setError: () => {},
	}) as never;

/** What nodemailer throws when the server stops answering. */
const relaySilent = () =>
	Object.assign(new Error("Connection timed out"), { code: "ETIMEDOUT", command: "CONN" });
const smtpReply = (responseCode: number, command = "RCPT TO", code = "EENVELOPE") =>
	Object.assign(new Error(`${responseCode} no`), { code, command, responseCode });
const loginRefused = () => smtpReply(535, "AUTH PLAIN", "EAUTH");

beforeEach(() => {
	sendMail.mockReset();
	sendMail.mockResolvedValue({});
});

afterEach(() => vi.unstubAllGlobals());

async function seedChannel(db: Db, organizationId: string, monitorId: string, type: string) {
	const id = `ch-${nanoid()}`;
	await db.insert(notificationChannel).values({
		id,
		organizationId,
		name: type,
		type,
		config: type === "email" ? { email: "ops@example.com" } : { url: `https://${id}.test/hook` },
		token: nanoid(),
		verifiedAt: new Date(),
	});
	await db.insert(monitorNotificationChannel).values({ monitorId, channelId: id });
	return id;
}

async function seedAlert(db: Db, channelTypes: string[]) {
	const organizationId = await seedOrg(db);
	const monitorId = await seedMonitor(db, organizationId);
	await db.insert(monitorStatus).values({ monitorId, status: "down" });
	const channels: string[] = [];
	for (const type of channelTypes) {
		channels.push(await seedChannel(db, organizationId, monitorId, type));
	}
	const id = `evt-${nanoid()}`;
	await db.insert(notificationEvent).values({
		id,
		organizationId,
		monitorId,
		type: "monitor_down",
		payload: { previousStatus: "up", newStatus: "down", consecutiveFailures: 1, checkId: "c" },
	});
	const row = async () =>
		(await db.select().from(notificationEvent).where(eq(notificationEvent.id, id)))[0];
	return { id, channels, row, monitorId };
}

/** Inserts a row whose next attempt is due. */
async function seedRetry(db: Db, organizationId: string, createdAt: Date) {
	const id = `evt-${nanoid()}`;
	await db.insert(notificationEvent).values({
		id,
		organizationId,
		type: "monitor_down",
		status: RETRIES.queued,
		createdAt,
		payload: {
			retry: { owed: [], reached: false, rejected: [], mailServerDown: false, attempt: 1 },
		},
	});
	await makeDue(db, id);
	return id;
}

const statusOf = async (db: Db, id: string) =>
	(await db.select().from(notificationEvent).where(eq(notificationEvent.id, id)))[0].status;

/** Moves a waiting row's next attempt into the past. */
const makeDue = (db: Db, id: string) =>
	db
		.update(notificationEvent)
		.set({
			payload: sql`jsonb_set(${notificationEvent.payload}, '{retry,nextAt}', to_jsonb(${new Date(Date.now() - 1000).toISOString()}::text))`,
		})
		.where(eq(notificationEvent.id, id));

const retrySweep = (db: Db) =>
	processBacklog(db, "sweep", stubEvent, new NotificationService(db), RETRIES);

/** Answers each webhook URL with its status, 200 when unlisted, and records the calls. */
function stubHooks(statusByChannel: Record<string, number>) {
	const hit = vi.fn(async (url: string) => {
		const channel = Object.keys(statusByChannel).find((id) => url.includes(id));
		return new Response("hook said no", { status: (channel && statusByChannel[channel]) || 200 });
	});
	vi.stubGlobal("fetch", hit);
	return hit;
}

describe("a relay silent past the SMTP timeouts", () => {
	test("delivers the alert late rather than losing it", async ({ db: { db } }) => {
		const { id, row } = await seedAlert(db, ["email"]);
		sendMail.mockRejectedValueOnce(relaySilent());

		await processOne(db, id, undefined, new NotificationService(db));

		expect(await row()).toMatchObject({ status: RETRIES.queued, processedAt: null });
		expect(await retrySweep(db)).toBe(0);
		expect(sendMail).toHaveBeenCalledTimes(1);

		await makeDue(db, id);
		expect(await retrySweep(db)).toBe(1);

		expect(sendMail).toHaveBeenCalledTimes(2);
		expect(await row()).toMatchObject({ status: "sent", errorMessage: null });
	});

	test("a retried alert states when it happened", async ({ db: { db } }) => {
		const { id, row } = await seedAlert(db, ["email"]);
		sendMail.mockRejectedValueOnce(relaySilent());
		await processOne(db, id, undefined, new NotificationService(db));
		await makeDue(db, id);
		const createdAt = new Date("2026-10-31T12:00:00.000Z");
		await db.update(notificationEvent).set({ createdAt }).where(eq(notificationEvent.id, id));

		await retrySweep(db);

		expect((await row()).status).toBe("sent");
		expect(sendMail.mock.lastCall?.[0].text).toContain("31 Oct 2026, 12:00 UTC");
	});
});

describe("what does not retry", () => {
	for (const command of ["RCPT TO", "DATA"]) {
		test(`an SMTP 550 to ${command} is final`, async ({ db: { db } }) => {
			const { id, row } = await seedAlert(db, ["email"]);
			sendMail.mockRejectedValueOnce(smtpReply(550, command));

			await processOne(db, id, undefined, new NotificationService(db));

			const { status, processedAt } = await row();
			expect(status).toBe("failed");
			expect(processedAt).not.toBeNull();
		});
	}

	for (const [name, failure] of [
		["a refused login", loginRefused()],
		["a refused sender", smtpReply(550, "MAIL FROM")],
	] as const) {
		test(`${name} fails every address, so it retries and tells the operator`, async ({
			db: { db },
		}) => {
			const { id, row } = await seedAlert(db, ["email"]);
			sendMail.mockRejectedValueOnce(failure);

			await processOne(db, id, undefined, new NotificationService(db));

			const { status, payload } = await row();
			expect(status).toBe(RETRIES.queued);
			expect(payload).toMatchObject({ retry: { mailServerDown: true } });
		});
	}

	test("a mailbox that is full now is no fault of the mail server", async ({ db: { db } }) => {
		const { id, row } = await seedAlert(db, ["email"]);
		sendMail.mockRejectedValueOnce(smtpReply(452));

		await processOne(db, id, undefined, new NotificationService(db));

		expect((await row()).payload).toMatchObject({ retry: { mailServerDown: false } });
	});

	test("an SMTP 451 waits for a retry", async ({ db: { db } }) => {
		const { id, row } = await seedAlert(db, ["email"]);
		sendMail.mockRejectedValueOnce(smtpReply(451));

		await processOne(db, id, undefined, new NotificationService(db));

		expect((await row()).status).toBe(RETRIES.queued);
	});

	for (const [code, status] of [
		[400, "failed"],
		[404, "failed"],
		[429, RETRIES.queued],
		[503, RETRIES.queued],
	] as const) {
		test(`a webhook ${code} ends as ${status}`, async ({ db: { db } }) => {
			const { id, channels, row } = await seedAlert(db, ["webhook"]);
			stubHooks({ [channels[0]]: code });

			await processOne(db, id, undefined, new NotificationService(db));

			expect((await row()).status).toBe(status);
		});
	}

	test("a confirmation email that fails stays final", async ({ db: { db } }) => {
		const organizationId = await seedOrg(db);
		const channelId = `ch-${nanoid()}`;
		await db.insert(notificationChannel).values({
			id: channelId,
			organizationId,
			name: "Ops",
			type: "email",
			config: { email: "stranger@example.com" },
			token: nanoid(),
		});
		const send = vi.fn(() => Promise.reject(relaySilent()));
		await new EmailChannelService(db, send).queueConfirmation(channelId, organizationId, {
			email: "admin@example.com",
			emailVerified: true,
		});
		const service = new NotificationService(db, undefined, undefined, send);

		await processBacklog(db, "sweep", stubEvent, service, CONFIRMATIONS);

		const [row] = await db
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.organizationId, organizationId));
		expect(row).toMatchObject({ status: "failed", payload: {} });
		expect(await retrySweep(db)).toBe(0);
	});
});

describe("an event with several channels", () => {
	test("a retry goes only to the channel that failed", async ({ db: { db } }) => {
		const { id, channels, row } = await seedAlert(db, ["webhook", "webhook"]);
		const hit = stubHooks({ [channels[0]]: 503 });

		await processOne(db, id, undefined, new NotificationService(db));
		expect(hit).toHaveBeenCalledTimes(2);
		expect((await row()).status).toBe(RETRIES.queued);

		const second = stubHooks({});
		await makeDue(db, id);
		await retrySweep(db);

		expect(second).toHaveBeenCalledTimes(1);
		expect(second.mock.lastCall?.[0]).toContain(channels[0]);
		expect((await row()).status).toBe("sent");
	});

	test("a rejection stays on the row after the other channel's retry works", async ({
		db: { db },
	}) => {
		const { id, channels, row } = await seedAlert(db, ["webhook", "webhook"]);
		stubHooks({ [channels[0]]: 404, [channels[1]]: 503 });

		await processOne(db, id, undefined, new NotificationService(db));

		const second = stubHooks({});
		await makeDue(db, id);
		await retrySweep(db);

		expect(second).toHaveBeenCalledTimes(1);
		expect(second.mock.lastCall?.[0]).toContain(channels[1]);
		const { status, errorMessage } = await row();
		expect(status).toBe("partial");
		expect(errorMessage).toContain(channels[0]);
	});

	test("a hanging channel does not delay the one beside it", async ({ db: { db } }) => {
		const { id, channels, row } = await seedAlert(db, ["email", "webhook"]);
		const hit = stubHooks({});
		const relay = Promise.withResolvers<void>();
		sendMail.mockReturnValueOnce(relay.promise);

		const dispatching = processOne(db, id, undefined, new NotificationService(db));

		await vi.waitFor(() => expect(hit).toHaveBeenCalledTimes(1));
		expect(hit.mock.lastCall?.[0]).toContain(channels[1]);
		relay.resolve();
		await dispatching;
		expect((await row()).status).toBe("sent");
	});
});

const recover = (db: Db, monitorId: string) =>
	db.update(monitorStatus).set({ status: "up" }).where(eq(monitorStatus.monitorId, monitorId));

describe("a retry that events have overtaken", () => {
	test("a late alert says it is late and what it says still holds", async ({ db: { db } }) => {
		const { id } = await seedAlert(db, ["email"]);
		sendMail.mockRejectedValueOnce(relaySilent());
		await processOne(db, id, undefined, new NotificationService(db));
		await makeDue(db, id);

		await retrySweep(db);

		const [[{ subject, text }]] = sendMail.mock.calls.slice(1) as [[Record<string, string>]];
		expect(subject).toMatch(/^Delayed: /);
		expect(text).toContain("late because earlier delivery attempts failed");
		expect(text).not.toContain("earlier state");
	});

	test("a down alert sent after recovery says the monitor is up", async ({ db: { db } }) => {
		const { id, row, monitorId } = await seedAlert(db, ["email"]);
		sendMail.mockRejectedValueOnce(relaySilent());
		await processOne(db, id, undefined, new NotificationService(db));
		await recover(db, monitorId);
		await makeDue(db, id);

		await retrySweep(db);

		const [[{ subject, text }]] = sendMail.mock.calls.slice(1) as [[Record<string, string>]];
		expect(subject).toMatch(/^Delayed, now up: /);
		expect(text).toContain("the status is now up");
		expect((await row()).status).toBe("sent");
	});

	test("a webhook does not get it, because a machine acts on it", async ({ db: { db } }) => {
		const { id, channels, row, monitorId } = await seedAlert(db, ["webhook"]);
		const hit = stubHooks({ [channels[0]]: 503 });
		await processOne(db, id, undefined, new NotificationService(db));
		await recover(db, monitorId);
		await makeDue(db, id);

		await retrySweep(db);

		expect(hit).toHaveBeenCalledOnce();
		expect((await row()).status).toBe("suppressed");
	});

	test("a first attempt is sent as ever, whatever the monitor has done", async ({ db: { db } }) => {
		const { id, channels, monitorId } = await seedAlert(db, ["webhook"]);
		const hit = stubHooks({ [channels[0]]: 200 });
		await recover(db, monitorId);

		await processOne(db, id, undefined, new NotificationService(db));

		expect(hit).toHaveBeenCalledOnce();
	});
});

describe("what a finished row keeps", () => {
	test("no retry state and no recipient address", async ({ db: { db } }) => {
		const { id, row } = await seedAlert(db, ["email", "webhook"]);
		const rejected = Object.assign(new Error("550 <ops@example.com> unknown"), {
			code: "EENVELOPE",
			command: "RCPT TO",
			responseCode: 550,
		});
		sendMail.mockRejectedValueOnce(rejected);
		const hit = vi.fn<() => Promise<Response>>();
		hit.mockResolvedValueOnce(new Response("busy", { status: 503 }));
		hit.mockResolvedValue(new Response("ok"));
		vi.stubGlobal("fetch", hit);

		await processOne(db, id, undefined, new NotificationService(db));
		expect(JSON.stringify(await row())).not.toContain("ops@example.com");
		await makeDue(db, id);
		await retrySweep(db);

		const final = await row();
		expect(final.status).toBe("partial");
		expect(final.errorMessage).toContain("<address>");
		expect(final.payload).not.toHaveProperty("retry");
		expect(JSON.stringify(final)).not.toContain("ops@example.com");
		const logs = await db.select().from(notificationLog);
		expect(JSON.stringify(logs)).not.toContain("ops@example.com");
	});
});

describe("the private address guard on a retry", () => {
	test("a host that now resolves privately ends the row, and nothing connects", async ({
		db: { db },
	}) => {
		const { id, channels, row } = await seedAlert(db, ["webhook"]);
		stubHooks({ [channels[0]]: 503 });
		await processOne(db, id, undefined, new NotificationService(db));
		vi.unstubAllGlobals();
		dnsLookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
		await makeDue(db, id);

		await retrySweep(db);

		const { status, errorMessage } = await row();
		expect(dnsLookup).toHaveBeenCalled();
		expect(status).toBe("failed");
		expect(errorMessage).toContain("Blocked");
	});
});

describe("when retries run out", () => {
	test("the row ends failed, after a bounded number of attempts", async ({ db: { db } }) => {
		const { id, channels, row } = await seedAlert(db, ["email"]);
		sendMail.mockImplementation(() => Promise.reject(relaySilent()));

		await processOne(db, id, undefined, new NotificationService(db));
		for (const _ of ALERT_RETRY_DELAYS_MS) {
			expect((await row()).status).toBe(RETRIES.queued);
			await makeDue(db, id);
			await retrySweep(db);
		}

		expect(sendMail).toHaveBeenCalledTimes(ALERT_RETRY_DELAYS_MS.length + 1);
		const final = await row();
		expect(final.status).toBe("failed");
		expect(final.processedAt).not.toBeNull();
		expect(final.errorMessage).toContain("Connection timed out");
		expect(final.payload).toMatchObject({ mailServerDown: true });
		expect(await retrySweep(db)).toBe(0);
		const attempts = await db
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.channelId, channels[0]));
		expect(attempts).toHaveLength(ALERT_RETRY_DELAYS_MS.length + 1);
	});
});

describe("the sweeps", () => {
	test("a hanging row does not hold up another organization's", async ({ db: { db } }) => {
		const stuck = await seedAlert(db, []);
		const other = await seedAlert(db, []);
		const relay = Promise.withResolvers<{ status: "sent" }>();
		const service = {
			dispatchEvent: (row: { id: string }) =>
				row.id === stuck.id ? relay.promise : Promise.resolve({ status: "sent" }),
		} as unknown as NotificationService;

		const sweep = processBacklog(db, "sweep", stubEvent, service, ALERTS);

		await vi.waitFor(async () => expect((await other.row()).status).toBe("sent"));
		expect((await stuck.row()).status).toBe(ALERTS.claimed);
		relay.resolve({ status: "sent" });
		expect(await sweep).toBe(2);
	});

	test("an organization's dead endpoint takes only its share of the retries", async ({
		db: { db },
	}) => {
		const dead = await seedOrg(db);
		const hung = Promise.withResolvers<{ status: "sent" }>();
		const inFlight = vi.fn();
		const rows = await Promise.all(
			Array.from({ length: 8 }, () => seedRetry(db, dead, new Date(Date.now() - 60_000))),
		);
		const other = await seedRetry(db, await seedOrg(db), new Date());
		const service = {
			dispatchEvent: (row: { id: string }) => {
				if (row.id === other) return Promise.resolve({ status: "sent" });
				inFlight();
				return hung.promise;
			},
		} as unknown as NotificationService;

		const sweep = processBacklog(db, "sweep", stubEvent, service, RETRIES);

		await vi.waitFor(async () => expect(await statusOf(db, other)).toBe("sent"), 10_000);
		expect(inFlight).toHaveBeenCalledTimes(5);
		hung.resolve({ status: "sent" });
		await sweep;
		expect(rows).toHaveLength(8);
	});

	test("two notifiers claim each row once", async ({ db: { db } }) => {
		const organizationId = await seedOrg(db);
		const ids = await Promise.all(
			Array.from({ length: 12 }, () => seedRetry(db, organizationId, new Date())),
		);
		await db
			.update(notificationEvent)
			.set({ status: "pending", payload: {} })
			.where(sql`${notificationEvent.id} in ${ids}`);

		const claims = await Promise.all(
			Array.from({ length: 20 }, () => claimPendingEvent(db, ALERTS)),
		);

		const claimed = claims.flatMap((row) => (row ? [row.id] : []));
		expect(new Set(claimed).size).toBe(claimed.length);
		expect(claimed.length).toBeGreaterThan(0);
	});

	test("two sweeps at once send each alert once", async ({ db: { db } }) => {
		const organizationId = await seedOrg(db);
		await Promise.all(Array.from({ length: 6 }, () => seedRetry(db, organizationId, new Date())));
		const sent = vi.fn();
		const service = {
			dispatchEvent: (row: { id: string }) => {
				sent(row.id);
				return Promise.resolve({ status: "sent" });
			},
		} as unknown as NotificationService;

		const [first, second] = await Promise.all([
			processBacklog(db, "sweep", stubEvent, service, ALERTS),
			processBacklog(db, "sweep", stubEvent, service, ALERTS),
		]);
		expect(first + second).toBe(sent.mock.calls.length);
		expect(new Set(sent.mock.calls.flat()).size).toBe(sent.mock.calls.length);
	});

	test("the alert sweep and LISTEN leave a waiting retry to its own lane", async ({
		db: { db },
	}) => {
		const { id, row } = await seedAlert(db, ["email"]);
		sendMail.mockRejectedValueOnce(relaySilent());
		await processOne(db, id, undefined, new NotificationService(db));
		await makeDue(db, id);

		expect(await processBacklog(db, "sweep", stubEvent, new NotificationService(db))).toBe(0);
		await processOne(db, id, undefined, new NotificationService(db));

		expect((await row()).status).toBe(RETRIES.queued);
		expect(sendMail).toHaveBeenCalledTimes(1);
	});
});

async function seedIncidentWithSubscribers(db: Db, addresses: string[]) {
	const organizationId = await seedOrg(db);
	const monitorId = await seedMonitor(db, organizationId);
	const pageId = `page-${nanoid()}`;
	await db.insert(statusPage).values({
		id: pageId,
		organizationId,
		name: "Status",
		slug: pageId.toLowerCase(),
		isPublic: true,
	});
	await db.insert(statusPageMonitor).values({ id: nanoid(), statusPageId: pageId, monitorId });
	for (const email of addresses) {
		await db.insert(statusPageSubscriber).values({
			id: nanoid(),
			statusPageId: pageId,
			email,
			token: nanoid(),
			verifiedAt: new Date(),
		});
	}
	const incidentId = `inc-${nanoid()}`;
	await db.insert(incident).values({
		id: incidentId,
		organizationId,
		title: "Outage",
		status: "investigating",
		impact: "major",
	});
	await db.insert(incidentMonitor).values({ incidentId, monitorId });
	const id = `evt-${nanoid()}`;
	await db.insert(notificationEvent).values({
		id,
		organizationId,
		incidentId,
		type: "incident_created",
		payload: {},
	});
	const row = async () =>
		(await db.select().from(notificationEvent).where(eq(notificationEvent.id, id)))[0];
	return { id, row, incidentId };
}

const serviceWith = (db: Db, send: (email: { email: string }) => Promise<void>) =>
	new NotificationService(db, undefined, send);

describe("status page subscribers on a retried incident", () => {
	test("an address nodemailer refuses costs the others nothing", async ({ db: { db } }) => {
		const { id, row } = await seedIncidentWithSubscribers(db, ["a@example.com", "b@example.com"]);
		const noRecipient = Object.assign(new Error("No recipients defined"), {
			code: "EENVELOPE",
			command: "API",
		});
		const send = vi.fn(async () => {});
		send.mockRejectedValueOnce(noRecipient);

		await processOne(db, id, undefined, serviceWith(db, send));

		expect(send).toHaveBeenCalledTimes(2);
		expect((await row()).status).toBe("partial");
	});

	test("a refused login stops the round rather than trying every address", async ({
		db: { db },
	}) => {
		const { id, row } = await seedIncidentWithSubscribers(db, ["a@example.com", "b@example.com"]);
		const send = vi.fn(async () => {});
		send.mockRejectedValueOnce(loginRefused());

		await processOne(db, id, undefined, serviceWith(db, send));

		expect(send).toHaveBeenCalledOnce();
		expect((await row()).payload).toMatchObject({ retry: { mailServerDown: true } });
	});

	test("a retry after the incident ended says so", async ({ db: { db } }) => {
		const { id, incidentId } = await seedIncidentWithSubscribers(db, ["a@example.com"]);
		const send = vi.fn(async (_email: { email: string; late?: unknown }) => {});
		send.mockRejectedValueOnce(relaySilent());
		await processOne(db, id, undefined, serviceWith(db, send));
		await db.update(incident).set({ status: "resolved" }).where(eq(incident.id, incidentId));
		await makeDue(db, id);

		await processBacklog(db, "sweep", stubEvent, serviceWith(db, send), RETRIES);

		expect(send.mock.calls[1][0].late).toMatchObject({ now: "resolved" });
	});

	test("a relay outage stops the round, and the retry reaches everyone once", async ({
		db: { db },
	}) => {
		const { id, row } = await seedIncidentWithSubscribers(db, ["a@example.com", "b@example.com"]);
		const delivered: string[] = [];
		const send = vi.fn(async ({ email }: { email: string }) => {
			delivered.push(email);
		});
		send.mockRejectedValueOnce(relaySilent());

		await processOne(db, id, undefined, serviceWith(db, send));

		expect(send).toHaveBeenCalledTimes(1);
		expect((await row()).status).toBe(RETRIES.queued);

		await makeDue(db, id);
		await processBacklog(db, "sweep", stubEvent, serviceWith(db, send), RETRIES);

		expect(delivered.toSorted()).toEqual(["a@example.com", "b@example.com"]);
		expect((await row()).status).toBe("sent");
	});

	test("a final rejection is not sent again and stays on the row", async ({ db: { db } }) => {
		const { id, row } = await seedIncidentWithSubscribers(db, ["a@example.com", "b@example.com"]);
		const failures = [smtpReply(550), smtpReply(451)];
		const send = vi.fn(async () => {
			const failure = failures.shift();
			if (failure) throw failure;
		});

		await processOne(db, id, undefined, serviceWith(db, send));
		expect((await row()).status).toBe(RETRIES.queued);

		await makeDue(db, id);
		await processBacklog(db, "sweep", stubEvent, serviceWith(db, send), RETRIES);

		expect(send).toHaveBeenCalledTimes(3);
		const { status, errorMessage } = await row();
		expect(status).toBe("partial");
		expect(errorMessage).toContain("550");
	});
});
