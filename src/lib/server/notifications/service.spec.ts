import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, describe, expect, vi } from "vitest";

import { organization } from "../db/auth-schema";
import {
	emailSuppression,
	incident,
	incidentMonitor,
	monitor,
	monitorNotificationChannel,
	monitorStatus,
	notificationChannel,
	notificationEvent,
	notificationLog,
	incidentUpdate,
	statusPage,
	statusPageMonitor,
	statusPageSubscriber,
} from "../db/schema";
import type { SubscriberIncidentEmail } from "../subscriber-email";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { NotificationService } from "./service";

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("../smtp", () => ({ smtpFrom: "alerts@example.com", smtpTransport: { sendMail } }));

async function seedOrg(drizzleDb: TestDb["db"]): Promise<string> {
	const suffix = nanoid();
	const orgId = `test-org-${suffix}`;
	await drizzleDb.insert(organization).values({
		id: orgId,
		name: `Test Org ${suffix}`,
		slug: orgId,
		createdAt: new Date(),
	});
	return orgId;
}

async function seedMonitor(drizzleDb: TestDb["db"], orgId: string): Promise<string> {
	const id = `mon-${nanoid()}`;
	await drizzleDb.insert(monitor).values({
		id,
		organizationId: orgId,
		name: "Probe",
		type: "http",
		url: "https://example.com",
		intervalSeconds: 300,
		timeoutSeconds: 30,
	});
	return id;
}

async function seedWebhookChannel(
	drizzleDb: TestDb["db"],
	orgId: string,
	// 127.0.0.1:1 refuses the connection immediately — deterministic fast failure
	// without DNS resolution or network egress (matches the integration spec pattern).
	url = "http://127.0.0.1:1/hook",
): Promise<string> {
	const id = `chan-${nanoid()}`;
	await drizzleDb.insert(notificationChannel).values({
		id,
		organizationId: orgId,
		name: "Webhook",
		type: "webhook",
		config: { url },
		enabled: true,
	});
	return id;
}

async function linkMonitorToChannel(
	drizzleDb: TestDb["db"],
	monitorId: string,
	channelId: string,
): Promise<void> {
	await drizzleDb.insert(monitorNotificationChannel).values({
		monitorId,
		channelId,
	});
}

async function seedIncident(
	drizzleDb: TestDb["db"],
	orgId: string,
	monitorIds: string[] = [],
): Promise<string> {
	const id = `inc-${nanoid()}`;
	await drizzleDb.insert(incident).values({
		id,
		organizationId: orgId,
		title: "Test incident",
		status: "investigating",
		impact: "minor",
		startedAt: new Date(),
	});
	for (const monitorId of monitorIds) {
		await drizzleDb.insert(incidentMonitor).values({ incidentId: id, monitorId });
	}
	return id;
}

async function enqueueIncidentEvent(
	drizzleDb: TestDb["db"],
	orgId: string,
	incidentId: string,
	type: "incident_created" | "incident_updated" | "incident_resolved",
): Promise<string> {
	const id = `evt-${nanoid()}`;
	await drizzleDb.insert(notificationEvent).values({
		id,
		organizationId: orgId,
		monitorId: null,
		incidentId,
		type,
		payload: {},
		status: "pending",
	});
	return id;
}

async function fetchEvent(drizzleDb: TestDb["db"], id: string) {
	const [row] = await drizzleDb
		.select()
		.from(notificationEvent)
		.where(eq(notificationEvent.id, id))
		.limit(1);
	return row;
}

describe("NotificationService.dispatchEvent (incident)", () => {
	test("fans out to channels linked to affected monitors, dedup by channel id", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		const m2 = await seedMonitor(drizzleDb, orgId);
		// One channel linked to both monitors — must dispatch once, not twice.
		const channelId = await seedWebhookChannel(drizzleDb, orgId);
		await linkMonitorToChannel(drizzleDb, m1, channelId);
		await linkMonitorToChannel(drizzleDb, m2, channelId);

		const incidentId = await seedIncident(drizzleDb, orgId, [m1, m2]);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");

		const row = await fetchEvent(drizzleDb, eventId);
		const result = await service.dispatchEvent(row);

		// Webhook will fail (no real server) but we only care about routing here.
		// The proof of dedup: notificationLog has exactly one row, not two.
		const logs = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.incidentId, incidentId));
		expect(logs).toHaveLength(1);
		expect(logs[0].channelId).toBe(channelId);
		// One unreachable webhook → all attempts fail → terminal status is "failed".
		expect(result.status).toBe("failed");
	});

	test("incident with zero linked monitors falls back to all enabled org channels", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const channelA = await seedWebhookChannel(drizzleDb, orgId);
		const channelB = await seedWebhookChannel(drizzleDb, orgId, "http://127.0.0.1:1/b");

		const incidentId = await seedIncident(drizzleDb, orgId, []);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");
		const row = await fetchEvent(drizzleDb, eventId);

		await service.dispatchEvent(row);

		const logs = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.incidentId, incidentId));
		const channelIds = logs.map((l) => l.channelId).toSorted();
		expect(channelIds).toEqual([channelA, channelB].toSorted());
	});

	test("incident with zero linked monitors AND zero org channels returns suppressed", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const incidentId = await seedIncident(drizzleDb, orgId, []);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");
		const row = await fetchEvent(drizzleDb, eventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("suppressed");
		expect((result as { status: "suppressed"; errorMessage: string }).errorMessage).toMatch(
			/no channels configured/,
		);
	});

	test("event with null incident_id returns suppressed (defensive branch)", async ({ db }) => {
		// The deleted-incident race is hard to exercise directly because the FK has
		// ON DELETE CASCADE — deleting the incident removes the event row before
		// dispatch could ever run. This test covers the closest reachable branch:
		// a row with incident_id null, which the suppress-on-missing-id check
		// guards against the same way.
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const orphanEventId = `evt-orphan-${nanoid()}`;
		await drizzleDb.insert(notificationEvent).values({
			id: orphanEventId,
			organizationId: orgId,
			monitorId: null,
			incidentId: null,
			type: "incident_created",
			payload: {},
			status: "pending",
		});
		const row = await fetchEvent(drizzleDb, orphanEventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("suppressed");
		expect((result as { status: "suppressed"; errorMessage: string }).errorMessage).toMatch(
			/no incident_id/,
		);
	});

	test("malformed payload (wrong shape for incident type) returns failed", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const incidentId = await seedIncident(drizzleDb, orgId, []);
		const eventId = `evt-${nanoid()}`;
		await drizzleDb.insert(notificationEvent).values({
			id: eventId,
			organizationId: orgId,
			monitorId: null,
			incidentId,
			type: "incident_created",
			// updateId expected to be string if present; numeric breaks valibot.
			payload: { updateId: 42 },
			status: "pending",
		});
		const row = await fetchEvent(drizzleDb, eventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("failed");
		expect((result as { status: "failed"; errorMessage: string }).errorMessage).toMatch(
			/invalid payload/,
		);
	});

	test("incident with linked monitors but no channels suppresses with explicit reason", async ({
		db,
	}) => {
		// Distinct from the org-wide fallback: the user explicitly scoped the incident
		// to a monitor that happens to have zero channels wired up. Falling back to
		// every org channel here would silently widen blast radius for a misconfigured
		// monitor, so we suppress with a message that points at the actual problem.
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		// Seed an enabled org channel that is NOT linked to m1 — the test proves it
		// doesn't get used.
		await seedWebhookChannel(drizzleDb, orgId, "https://example.test/unrelated");

		const incidentId = await seedIncident(drizzleDb, orgId, [m1]);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");
		const row = await fetchEvent(drizzleDb, eventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("suppressed");
		expect((result as { status: "suppressed"; errorMessage: string }).errorMessage).toMatch(
			/linked monitors have no channels configured/,
		);

		// Belt-and-suspenders: no notificationLog row was written.
		const logs = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.incidentId, incidentId));
		expect(logs).toHaveLength(0);
	});

	test("never pages another organization's channels through a cross-organization link", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const victimOrg = await seedOrg(drizzleDb);
		const attackerOrg = await seedOrg(drizzleDb);
		const victimMonitor = await seedMonitor(drizzleDb, victimOrg);
		const victimChannel = await seedWebhookChannel(drizzleDb, victimOrg);
		await linkMonitorToChannel(drizzleDb, victimMonitor, victimChannel);

		// An attacker's incident linked to the victim's monitor, as written before
		// incident creation checked monitor ownership.
		const incidentId = await seedIncident(drizzleDb, attackerOrg, [victimMonitor]);
		const eventId = await enqueueIncidentEvent(
			drizzleDb,
			attackerOrg,
			incidentId,
			"incident_created",
		);
		const row = await fetchEvent(drizzleDb, eventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("suppressed");
		const logs = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.incidentId, incidentId));
		expect(logs).toHaveLength(0);
	});
});

async function seedPage(
	drizzleDb: TestDb["db"],
	orgId: string,
	monitorIds: string[],
	isPublic = true,
): Promise<string> {
	const id = `sp-${nanoid()}`;
	await drizzleDb
		.insert(statusPage)
		.values({ id, organizationId: orgId, name: "Acme", slug: id.toLowerCase(), isPublic });
	for (const monitorId of monitorIds) {
		await drizzleDb.insert(statusPageMonitor).values({ id: nanoid(), statusPageId: id, monitorId });
	}
	return id;
}

async function seedSubscriber(
	drizzleDb: TestDb["db"],
	statusPageId: string,
	email: string,
	confirmed = true,
): Promise<void> {
	await drizzleDb.insert(statusPageSubscriber).values({
		id: nanoid(),
		statusPageId,
		email,
		token: nanoid(),
		verifiedAt: confirmed ? new Date() : null,
	});
}

function recordingSender() {
	const sent: SubscriberIncidentEmail[] = [];
	const send = vi.fn(async (email: SubscriberIncidentEmail) => {
		sent.push(email);
	});
	return { sent, send };
}

async function seedSwitchedOffEvent(drizzleDb: TestDb["db"]) {
	const orgId = await seedOrg(drizzleDb);
	const monitorId = await seedMonitor(drizzleDb, orgId);
	const page = await seedPage(drizzleDb, orgId, [monitorId]);
	await seedSubscriber(drizzleDb, page, "confirmed@example.com");
	const incidentId = await seedIncident(drizzleDb, orgId, [monitorId]);
	const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");
	return fetchEvent(drizzleDb, eventId);
}

async function sentWithSwitchOff(drizzleDb: TestDb["db"]) {
	const { sent, send } = recordingSender();
	const service = new NotificationService(drizzleDb, undefined, send);
	await service.dispatchEvent(await seedSwitchedOffEvent(drizzleDb));
	return sent.map((email) => email.email);
}

describe("NotificationService.dispatchEvent (subscribers)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("sends nothing while the organization's subscriber email is off", async ({ db }) => {
		vi.stubEnv("UPPITY_GATE_SUBSCRIBER_EMAIL", "true");
		const { db: drizzleDb } = db;
		const { send } = recordingSender();
		const service = new NotificationService(drizzleDb, undefined, send);

		const result = await service.dispatchEvent(await seedSwitchedOffEvent(drizzleDb));

		expect(send).not.toHaveBeenCalled();
		expect(result.status).toBe("suppressed");
	});

	test("an instance without the gate setting sends with the switch off", async ({ db }) => {
		expect(await sentWithSwitchOff(db.db)).toEqual(["confirmed@example.com"]);
	});

	test("a self-hosted instance sends with the switch off, whatever the setting", async ({ db }) => {
		vi.stubEnv("SELF_HOSTED", "true");
		vi.stubEnv("UPPITY_GATE_SUBSCRIBER_EMAIL", "true");

		expect(await sentWithSwitchOff(db.db)).toEqual(["confirmed@example.com"]);
	});

	test("emails confirmed subscribers of public pages that show the incident", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { sent, send } = recordingSender();
		const service = new NotificationService(drizzleDb, undefined, send);
		const orgId = await seedOrg(drizzleDb);
		const affected = await seedMonitor(drizzleDb, orgId);
		const unrelated = await seedMonitor(drizzleDb, orgId);

		const shown = await seedPage(drizzleDb, orgId, [affected]);
		await seedSubscriber(drizzleDb, shown, "confirmed@example.com");
		await seedSubscriber(drizzleDb, shown, "pending@example.com", false);
		await seedSubscriber(
			drizzleDb,
			await seedPage(drizzleDb, orgId, [affected], false),
			"private@example.com",
		);
		await seedSubscriber(
			drizzleDb,
			await seedPage(drizzleDb, orgId, [unrelated]),
			"other@example.com",
		);

		const incidentId = await seedIncident(drizzleDb, orgId, [affected]);
		await drizzleDb
			.insert(incidentUpdate)
			.values({ id: nanoid(), incidentId, status: "investigating", message: "Looking into it" });
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");

		// No operator channels: subscribers alone make the event a success.
		const result = await service.dispatchEvent(await fetchEvent(drizzleDb, eventId));

		expect(result.status).toBe("sent");
		expect(sent.map((e) => e.email)).toEqual(["confirmed@example.com"]);
		expect(sent[0]).toMatchObject({ kind: "incident_created", message: "Looking into it" });
	});

	test("skips a subscriber whose address is suppressed", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { sent, send } = recordingSender();
		const service = new NotificationService(drizzleDb, undefined, send);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const page = await seedPage(drizzleDb, orgId, [monitorId]);
		await seedSubscriber(drizzleDb, page, "ok@example.com");
		await seedSubscriber(drizzleDb, page, "gone@example.com");
		await drizzleDb
			.insert(emailSuppression)
			.values({ email: "gone@example.com", reason: "bounce" });
		const incidentId = await seedIncident(drizzleDb, orgId, [monitorId]);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_resolved");

		await service.dispatchEvent(await fetchEvent(drizzleDb, eventId));

		expect(sent.map((e) => e.email)).toEqual(["ok@example.com"]);
	});

	test("a retried event emails nobody twice", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { sent, send } = recordingSender();
		const service = new NotificationService(drizzleDb, undefined, send);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		await seedSubscriber(drizzleDb, await seedPage(drizzleDb, orgId, [monitorId]), "a@example.com");
		const incidentId = await seedIncident(drizzleDb, orgId, [monitorId]);
		const row = await fetchEvent(
			drizzleDb,
			await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_resolved"),
		);

		await service.dispatchEvent(row);
		const retry = await service.dispatchEvent(row);

		expect(sent).toHaveLength(1);
		expect(retry.status).toBe("suppressed");
	});

	test("a failed send makes the event partial when others got through", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { sent, send } = recordingSender();
		send.mockRejectedValueOnce(new Error("mailbox full"));
		const service = new NotificationService(drizzleDb, undefined, send);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const pageId = await seedPage(drizzleDb, orgId, [monitorId]);
		await seedSubscriber(drizzleDb, pageId, "a@example.com");
		await seedSubscriber(drizzleDb, pageId, "b@example.com");
		const incidentId = await seedIncident(drizzleDb, orgId, [monitorId]);
		const row = await fetchEvent(
			drizzleDb,
			await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_updated"),
		);

		const result = await service.dispatchEvent(row);

		expect(sent).toHaveLength(1);
		expect(result).toMatchObject({ status: "partial" });
		expect(result.status !== "sent" && result.errorMessage).toContain("mailbox full");
	});
});

describe("NotificationService.dispatchEvent (checks stopped)", () => {
	afterEach(() => vi.unstubAllGlobals());

	test("webhooks get no status, since the recorded one is stale", async ({ db }) => {
		const { db: drizzleDb } = db;
		const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
		vi.stubGlobal("fetch", fetchMock);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(monitorStatus).values({ monitorId, status: "up" });
		await linkMonitorToChannel(drizzleDb, monitorId, await seedWebhookChannel(drizzleDb, orgId));
		const templated = await seedWebhookChannel(drizzleDb, orgId);
		await drizzleDb
			.update(notificationChannel)
			.set({ config: { url: "http://127.0.0.1:1/hook", bodyTemplate: '{"text":"[{{status}}]"}' } })
			.where(eq(notificationChannel.id, templated));
		await linkMonitorToChannel(drizzleDb, monitorId, templated);
		const eventId = `evt-${nanoid()}`;
		await drizzleDb.insert(notificationEvent).values({
			id: eventId,
			organizationId: orgId,
			monitorId,
			type: "monitor_checks_stopped",
			payload: {},
			status: "pending",
		});

		const result = await new NotificationService(drizzleDb).dispatchEvent(
			await fetchEvent(drizzleDb, eventId),
		);

		expect(result).toEqual({ status: "sent" });
		const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
		expect(bodies).toContainEqual(expect.objectContaining({ status: null }));
		expect(bodies).toContainEqual({ text: "[]" });
	});
});

/** Sends a monitor_down alert to one channel of each type; returns what each one received. */
async function alertEveryChannel(drizzleDb: TestDb["db"], url: string) {
	const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
	vi.stubGlobal("fetch", fetchMock);
	const orgId = await seedOrg(drizzleDb);
	const monitorId = await seedMonitor(drizzleDb, orgId);
	await drizzleDb.update(monitor).set({ url }).where(eq(monitor.id, monitorId));
	await drizzleDb.insert(monitorStatus).values({ monitorId, status: "down" });

	const channels = [
		{ type: "webhook", config: { url: "http://127.0.0.1:1/plain" } },
		{
			type: "webhook",
			config: { url: "http://127.0.0.1:1/templated", bodyTemplate: '{"at":"{{monitor.url}}"}' },
		},
		{ type: "slack", config: { webhookUrl: "http://127.0.0.1:1/slack" } },
		{ type: "discord", config: { discordWebhookUrl: "http://127.0.0.1:1/discord" } },
		{ type: "email", config: { email: "oncall@example.com" }, token: nanoid() },
	] as const;
	for (const channel of channels) {
		const id = `chan-${nanoid()}`;
		await drizzleDb.insert(notificationChannel).values({
			...channel,
			id,
			organizationId: orgId,
			name: channel.type,
			verifiedAt: new Date(),
		});
		await linkMonitorToChannel(drizzleDb, monitorId, id);
	}

	const eventId = `evt-${nanoid()}`;
	await drizzleDb.insert(notificationEvent).values({
		id: eventId,
		organizationId: orgId,
		monitorId,
		type: "monitor_down",
		payload: { previousStatus: "up", newStatus: "down", consecutiveFailures: 1, checkId: "c" },
		status: "pending",
	});

	await new NotificationService(drizzleDb).dispatchEvent(await fetchEvent(drizzleDb, eventId));

	const bodies = new Map(
		fetchMock.mock.calls.map(([target, init]) => [
			new URL(target as string).pathname.slice(1),
			init.body as string,
		]),
	);
	const [mail] = sendMail.mock.lastCall!;
	return { bodies, mail, sent: [...bodies.values(), mail.text, mail.html].join("\n") };
}

describe("NotificationService.dispatchEvent (monitor URL)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		sendMail.mockReset();
	});

	test("every channel gets the URL without its credentials, query values or fragment", async ({
		db,
	}) => {
		const { bodies, mail, sent } = await alertEveryChannel(
			db.db,
			"https://admin:hunter2@example.com/health?token=abc123#session=def456",
		);

		for (const secret of ["admin", "hunter2", "abc123", "def456"]) {
			expect(sent).not.toContain(secret);
		}
		const redacted = "https://example.com/health?token=***";
		expect(JSON.parse(bodies.get("plain")!).monitor.url).toBe(redacted);
		expect(JSON.parse(bodies.get("templated")!)).toEqual({ at: redacted });
		expect(JSON.parse(bodies.get("slack")!).attachments[0].blocks).toContainEqual({
			type: "section",
			text: { type: "mrkdwn", text: `*URL:* ${redacted}` },
		});
		expect(JSON.parse(bodies.get("discord")!).embeds[0].fields).toContainEqual({
			name: "URL",
			value: redacted,
			inline: false,
		});
		expect(mail.text).toContain(`URL: ${redacted}`);
		expect(mail.html).toContain(`<strong>URL:</strong> ${redacted}`);
	});

	test("every channel omits a URL it cannot read", async ({ db }) => {
		for (const url of ["admin:hunter2@example.com/health", "not a url hunter2"]) {
			const { bodies, mail, sent } = await alertEveryChannel(db.db, url);

			expect(sent).not.toContain("hunter2");
			expect(JSON.parse(bodies.get("plain")!).monitor.url).toBeNull();
			expect(JSON.parse(bodies.get("templated")!)).toEqual({ at: "" });
			expect(bodies.get("slack")).not.toContain("URL:");
			expect(bodies.get("discord")).not.toContain('"URL"');
			expect(mail.text).not.toContain("URL:");
		}
	});
});

describe("NotificationService.dispatchEvent (email confirmation)", () => {
	test("skips email channels whose recipient has not confirmed", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(monitorStatus).values({ monitorId, status: "down" });
		const channelId = `chan-${nanoid()}`;
		await drizzleDb.insert(notificationChannel).values({
			id: channelId,
			organizationId: orgId,
			name: "Stranger",
			type: "email",
			config: { email: "stranger@example.com" },
			token: nanoid(),
		});
		await linkMonitorToChannel(drizzleDb, monitorId, channelId);
		const eventId = `evt-${nanoid()}`;
		await drizzleDb.insert(notificationEvent).values({
			id: eventId,
			organizationId: orgId,
			monitorId,
			type: "monitor_down",
			payload: { previousStatus: "up", newStatus: "down", consecutiveFailures: 1, checkId: "c" },
			status: "pending",
		});

		const result = await new NotificationService(drizzleDb).dispatchEvent(
			await fetchEvent(drizzleDb, eventId),
		);

		expect(result.status).toBe("suppressed");
		const logs = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.channelId, channelId));
		expect(logs).toHaveLength(0);
	});
});

describe("NotificationService.dispatchEvent (incident, email confirmation)", () => {
	test("the org-wide fallback skips unconfirmed email channels", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrg(drizzleDb);
		await drizzleDb.insert(notificationChannel).values({
			id: `chan-${nanoid()}`,
			organizationId: orgId,
			name: "Stranger",
			type: "email",
			config: { email: "stranger@example.com" },
			token: nanoid(),
		});
		const incidentId = await seedIncident(drizzleDb, orgId);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");

		const result = await new NotificationService(drizzleDb).dispatchEvent(
			await fetchEvent(drizzleDb, eventId),
		);

		expect(result).toEqual({ status: "suppressed", errorMessage: "no channels configured" });
	});
});
