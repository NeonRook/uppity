import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, vi } from "vitest";

import { user } from "../db/auth-schema";
import { channelConfirmationSend, notificationChannel } from "../db/schema";
import type { ChannelConfirmation } from "../notifications/email";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedMember, seedOrg } from "../test/seed";
import {
	CONFIRMATION_TTL_HOURS,
	EmailChannelService,
	freshRecipient,
	PENDING_WINDOW_MS,
	pruneChannelConfirmationSends,
	RESEND_INTERVAL_MS,
} from "./email-channel.service";

const HOUR_MS = 60 * 60_000;
const ADMIN = "admin@example.com";

async function setup(db: TestDb["db"], cap?: number) {
	const orgId = await seedOrg(db);
	const sent: ChannelConfirmation[] = [];
	const send = vi.fn(async (c: ChannelConfirmation) => {
		sent.push(c);
	});
	return { orgId, sent, send, service: new EmailChannelService(db, send, cap) };
}

async function seedEmailChannel(db: TestDb["db"], orgId: string, email = "stranger@example.com") {
	const id = `ch-${nanoid()}`;
	const recipient = freshRecipient();
	await db.insert(notificationChannel).values({
		id,
		organizationId: orgId,
		name: "Ops",
		type: "email",
		config: { email },
		...recipient,
	});
	return { id, token: recipient.token };
}

const backdate = (db: TestDb["db"], id: string, ms: number) =>
	db
		.update(notificationChannel)
		.set({ confirmationSentAt: new Date(Date.now() - ms) })
		.where(eq(notificationChannel.id, id));

describe("EmailChannelService.requestConfirmation", () => {
	test("emails a link to an address outside the organization", async ({ db: { db } }) => {
		const { orgId, sent, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
		expect(sent).toEqual([
			{ email: "stranger@example.com", token: channel.token, requestedBy: ADMIN },
		]);
		expect((await service.lookup(channel.token))?.state).toBe("pending");
	});

	test("confirms a verified member's address without email", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const userId = await seedMember(db, orgId);
		const channel = await seedEmailChannel(db, orgId, `${userId.toUpperCase()}@EXAMPLE.COM`);

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("confirmed");
		expect(send).not.toHaveBeenCalled();
	});

	test("emails an unverified member's address", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const userId = await seedMember(db, orgId);
		await db.update(user).set({ emailVerified: false }).where(eq(user.id, userId));
		const channel = await seedEmailChannel(db, orgId, `${userId}@example.com`);

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
	});

	test("emails a verified member of another organization", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const userId = await seedMember(db, await seedOrg(db));
		const channel = await seedEmailChannel(db, orgId, `${userId}@example.com`);

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
	});

	test("waits out the resend interval", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);

		await service.requestConfirmation(channel.id, orgId, ADMIN);
		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("too_soon");

		await backdate(db, channel.id, RESEND_INTERVAL_MS + 1000);
		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
		expect(send).toHaveBeenCalledTimes(2);
	});

	test("caps unconfirmed sends per organization", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db, 2);
		const channels = [];
		for (let i = 0; i < 3; i++) {
			const channel = await seedEmailChannel(db, orgId, `s${i}@example.com`);
			channels.push(channel);
			await service.requestConfirmation(channel.id, orgId, ADMIN);
		}
		expect(send).toHaveBeenCalledTimes(2);

		await service.confirm(channels[0].token);
		expect(await service.requestConfirmation(channels[2].id, orgId, ADMIN)).toBe("sent");

		const other = await setup(db, 2);
		const channel = await seedEmailChannel(db, other.orgId);
		expect(await other.service.requestConfirmation(channel.id, other.orgId, ADMIN)).toBe("sent");
	});

	test("deleting a channel keeps its slot taken", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db, 1);
		const first = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(first.id, orgId, ADMIN);
		await db.delete(notificationChannel).where(eq(notificationChannel.id, first.id));

		const second = await seedEmailChannel(db, orgId);
		expect(await service.requestConfirmation(second.id, orgId, ADMIN)).toBe("capped");
	});

	test("confirming a new address does not free the old one's slot", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db, 2);
		const channel = await seedEmailChannel(db, orgId, "victim@example.com");
		await service.requestConfirmation(channel.id, orgId, ADMIN);

		const readdressed = freshRecipient();
		await db
			.update(notificationChannel)
			.set({ config: { email: "mine@example.com" }, ...readdressed })
			.where(eq(notificationChannel.id, channel.id));
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.confirm(readdressed.token);

		const next = await seedEmailChannel(db, orgId);
		expect(await service.requestConfirmation(next.id, orgId, ADMIN)).toBe("sent");
		const another = await seedEmailChannel(db, orgId);
		expect(await service.requestConfirmation(another.id, orgId, ADMIN)).toBe("capped");
	});

	test("unconfirmed sends stop counting after the window", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db, 1);
		const first = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(first.id, orgId, ADMIN);
		await db
			.update(channelConfirmationSend)
			.set({ sentAt: new Date(Date.now() - PENDING_WINDOW_MS - 1000) })
			.where(eq(channelConfirmationSend.organizationId, orgId));

		const second = await seedEmailChannel(db, orgId);
		expect(await service.requestConfirmation(second.id, orgId, ADMIN)).toBe("sent");
		expect(await pruneChannelConfirmationSends(db)).toBeGreaterThanOrEqual(1);
	});

	test("a failed send can be retried at once", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		const failing = new EmailChannelService(db, () => Promise.reject(new Error("smtp down")));

		await expect(failing.requestConfirmation(channel.id, orgId, ADMIN)).rejects.toThrow(
			"smtp down",
		);
		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
	});

	test("ignores channels of another organization", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, await seedOrg(db));

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBeNull();
	});
});

describe("EmailChannelService.confirm", () => {
	test("confirms a pending address", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(channel.id, orgId, ADMIN);

		expect(await service.confirm(channel.token)).toBe(true);
		expect(await service.confirm(channel.token)).toBe(true);
		expect((await service.lookup(channel.token))?.state).toBe("confirmed");
	});

	test("rejects an expired link", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await backdate(db, channel.id, CONFIRMATION_TTL_HOURS * HOUR_MS + 1000);

		expect(await service.confirm(channel.token)).toBe(false);
		expect((await service.lookup(channel.token))?.state).toBe("expired");
	});

	test("rejects a link that was never sent", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);

		expect(await service.confirm(channel.token)).toBe(false);
	});
});

describe("EmailChannelService.unsubscribe", () => {
	test("stops alerts and the outstanding link, and reports it", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.confirm(channel.token);

		expect(await service.unsubscribe(channel.token)).toMatchObject({
			organizationId: orgId,
			email: "stranger@example.com",
			final: false,
		});
		expect(await service.unsubscribe(channel.token)).toBeNull();

		expect((await service.lookup(channel.token))?.state).toBe("unsubscribed");
		expect(await service.confirm(channel.token)).toBe(false);
	});

	test("the organization may ask once more, under a new token", async ({ db: { db } }) => {
		const { orgId, sent, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.unsubscribe(channel.token);
		await backdate(db, channel.id, RESEND_INTERVAL_MS + 1000);

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
		const reasked = sent[1].token;
		expect(reasked).not.toBe(channel.token);
		expect(await service.lookup(channel.token)).toBeNull();
		expect(await service.lookup(reasked)).toMatchObject({ state: "pending", reasked: true });

		expect(await service.unsubscribe(reasked)).toMatchObject({ final: true });
		await backdate(db, channel.id, RESEND_INTERVAL_MS + 1000);
		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("unsubscribed");
		expect(sent).toHaveLength(2);
	});

	test("a member's own unsubscribe is not overridden", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const userId = await seedMember(db, orgId);
		const channel = await seedEmailChannel(db, orgId, `${userId}@example.com`);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.unsubscribe(channel.token);

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
		expect(send).toHaveBeenCalledTimes(1);
	});

	test("an unknown token is a no-op", async ({ db: { db } }) => {
		const { service } = await setup(db);

		await service.unsubscribe("nope");
		expect(await service.lookup("nope")).toBeNull();
	});
});
