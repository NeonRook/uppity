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
