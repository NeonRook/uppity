import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { monitorNotificationChannel, notificationChannel } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedMonitor, seedOrg } from "../test/seed";
import { MonitorChannelService, type MonitorChannelLink } from "./monitor-channel.service";

async function seedChannel(db: TestDb["db"], orgId: string): Promise<string> {
	const id = `ch-${nanoid()}`;
	await db.insert(notificationChannel).values({
		id,
		organizationId: orgId,
		name: "Ops",
		type: "email",
		config: { email: "ops@example.com" },
	});
	return id;
}

function link(channelId: string, overrides: Partial<MonitorChannelLink> = {}): MonitorChannelLink {
	return {
		channelId,
		notifyOnDown: true,
		notifyOnUp: true,
		notifyOnDegraded: false,
		notifyOnSslExpiry: true,
		...overrides,
	};
}

describe("MonitorChannelService.replace", () => {
	test("replaces the monitor's links and keeps per-link events", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		const monitorId = await seedMonitor(db, orgId);
		const first = await seedChannel(db, orgId);
		const second = await seedChannel(db, orgId);

		expect(await service.replace(monitorId, orgId, [link(first)])).toBe(true);
		expect(await service.replace(monitorId, orgId, [link(second, { notifyOnUp: false })])).toBe(
			true,
		);

		expect(await service.list(monitorId, orgId)).toEqual([link(second, { notifyOnUp: false })]);
	});

	test("an empty list detaches every channel", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		const monitorId = await seedMonitor(db, orgId);
		await service.replace(monitorId, orgId, [link(await seedChannel(db, orgId))]);

		expect(await service.replace(monitorId, orgId, [])).toBe(true);
		expect(await service.list(monitorId, orgId)).toEqual([]);
	});

	test("refuses another organization's channel and writes nothing", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		const monitorId = await seedMonitor(db, orgId);
		const own = await seedChannel(db, orgId);
		await service.replace(monitorId, orgId, [link(own)]);
		const foreign = await seedChannel(db, await seedOrg(db));

		expect(await service.replace(monitorId, orgId, [link(own), link(foreign)])).toBe(false);
		expect(await service.list(monitorId, orgId)).toEqual([link(own)]);
	});

	test("refuses another organization's monitor", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		const foreignMonitor = await seedMonitor(db, await seedOrg(db));
		const channel = await seedChannel(db, orgId);

		expect(await service.replace(foreignMonitor, orgId, [link(channel)])).toBe(false);
		const rows = await db
			.select()
			.from(monitorNotificationChannel)
			.where(eq(monitorNotificationChannel.monitorId, foreignMonitor));
		expect(rows).toEqual([]);
	});
});

describe("MonitorChannelService.setMonitors", () => {
	test("attaches with default events and keeps existing links' events", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		const channel = await seedChannel(db, orgId);
		const kept = await seedMonitor(db, orgId);
		const added = await seedMonitor(db, orgId);
		const dropped = await seedMonitor(db, orgId);
		await service.replace(kept, orgId, [link(channel, { notifyOnUp: false })]);
		await service.replace(dropped, orgId, [link(channel)]);

		expect(await service.setMonitors(channel, orgId, [kept, added])).toBe(true);

		expect((await service.monitorsFor(channel, orgId)).toSorted()).toEqual(
			[kept, added].toSorted(),
		);
		expect(await service.list(kept, orgId)).toEqual([link(channel, { notifyOnUp: false })]);
		expect(await service.list(added, orgId)).toEqual([link(channel)]);
	});

	test("an empty list detaches the channel from every monitor", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		const channel = await seedChannel(db, orgId);
		const monitorId = await seedMonitor(db, orgId);
		await service.replace(monitorId, orgId, [link(channel)]);

		expect(await service.setMonitors(channel, orgId, [])).toBe(true);
		expect(await service.monitorsFor(channel, orgId)).toEqual([]);
	});

	test("refuses another organization's monitor and writes nothing", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		const channel = await seedChannel(db, orgId);
		const own = await seedMonitor(db, orgId);
		const foreign = await seedMonitor(db, await seedOrg(db));

		expect(await service.setMonitors(channel, orgId, [own, foreign])).toBe(false);
		expect(await service.monitorsFor(channel, orgId)).toEqual([]);
	});

	test("refuses another organization's channel", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		const foreignChannel = await seedChannel(db, await seedOrg(db));

		expect(await service.setMonitors(foreignChannel, orgId, [await seedMonitor(db, orgId)])).toBe(
			false,
		);
	});
});

describe("MonitorChannelService.options", () => {
	test("shows where alerts land without exposing webhook credentials", async ({ db: { db } }) => {
		const service = new MonitorChannelService(db);
		const orgId = await seedOrg(db);
		await db.insert(notificationChannel).values([
			{
				id: "a",
				organizationId: orgId,
				name: "A email",
				type: "email",
				config: { email: "ops@example.com" },
			},
			{
				id: "b",
				organizationId: orgId,
				name: "B slack",
				type: "slack",
				config: { webhookUrl: "https://hooks.slack.com/services/T/B/secret", channel: "alerts" },
			},
			{
				id: "c",
				organizationId: orgId,
				name: "C discord",
				type: "discord",
				config: { discordWebhookUrl: "https://discord.com/api/webhooks/1/secret" },
			},
			{
				id: "d",
				organizationId: orgId,
				name: "D hook",
				type: "webhook",
				config: { url: "https://hooks.example.com/in/secret?token=x" },
			},
		]);

		const options = await service.options(orgId);

		expect(options.map((o) => o.destination)).toEqual([
			"ops@example.com",
			"#alerts",
			null,
			"hooks.example.com",
		]);
		expect(JSON.stringify(options)).not.toContain("secret");
	});
});
