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
	CONFIRMATIONS,
	processBacklog,
	processOne,
	RETRIES,
} from "./processor";

const sendMail = vi.hoisted(() => vi.fn());
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
const smtpReply = (responseCode: number) =>
	Object.assign(new Error(`${responseCode} no`), { code: "EENVELOPE", responseCode });

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
	return { id, channels, row };
}

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
	for (const code of [550, 535]) {
		test(`an SMTP ${code} is final`, async ({ db: { db } }) => {
			const { id, row } = await seedAlert(db, ["email"]);
			sendMail.mockRejectedValueOnce(smtpReply(code));

			await processOne(db, id, undefined, new NotificationService(db));

			const { status, processedAt } = await row();
			expect(status).toBe("failed");
			expect(processedAt).not.toBeNull();
		});
	}

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
	return { id, row };
}

const serviceWith = (db: Db, send: (email: { email: string }) => Promise<void>) =>
	new NotificationService(db, undefined, send);

describe("status page subscribers on a retried incident", () => {
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
