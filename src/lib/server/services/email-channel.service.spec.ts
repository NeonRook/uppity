import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as v from "valibot";
import { describe, expect, vi } from "vitest";

import { user } from "../db/auth-schema";
import {
	channelConfirmationSend,
	emailSuppression,
	mailEvent,
	notificationChannel,
	notificationEvent,
	organizationMailBlock,
	unsolicitedMailSend,
} from "../db/schema";
import type { ChannelConfirmation } from "../notifications/email";
import { ChannelConfirmationPayload } from "../notifications/events";
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
import { recordMailFailure } from "./mail-reputation.service";

const HOUR_MS = 60 * 60_000;
const ADMIN = { email: "admin@example.com", emailVerified: true };

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

/** Moves the organization's sends, and the channel links, past the resend interval. */
async function backdateSends(db: TestDb["db"], orgId: string) {
	const past = new Date(Date.now() - RESEND_INTERVAL_MS - 1000);
	await db
		.update(channelConfirmationSend)
		.set({ sentAt: past })
		.where(eq(channelConfirmationSend.organizationId, orgId));
}

/** Moves the channel's link and its organization's sends `ms` into the past. */
async function backdate(db: TestDb["db"], id: string, ms: number) {
	const at = new Date(Date.now() - ms);
	const [channel] = await db
		.update(notificationChannel)
		.set({ confirmationSentAt: at })
		.where(eq(notificationChannel.id, id))
		.returning({ organizationId: notificationChannel.organizationId });
	if (channel) {
		await db
			.update(channelConfirmationSend)
			.set({ sentAt: at })
			.where(eq(channelConfirmationSend.organizationId, channel.organizationId));
	}
}

describe("EmailChannelService.requestConfirmation", () => {
	test("emails a link to an address outside the organization", async ({ db: { db } }) => {
		const { orgId, sent, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
		expect(sent).toEqual([
			{ email: "stranger@example.com", token: channel.token, requestedBy: ADMIN.email },
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

	test("an unverified requester sends nothing", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);

		expect(
			await service.requestConfirmation(channel.id, orgId, { ...ADMIN, emailVerified: false }),
		).toBe("unverified");
		expect(send).not.toHaveBeenCalled();
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

		const second = await seedEmailChannel(db, orgId, "other@example.com");
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

		const next = await seedEmailChannel(db, orgId, "next@example.com");
		expect(await service.requestConfirmation(next.id, orgId, ADMIN)).toBe("sent");
		const another = await seedEmailChannel(db, orgId, "another@example.com");
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

	test("resends to one address take one slot", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db, 2);
		const slow = await seedEmailChannel(db, orgId, "slow@example.com");
		for (let i = 0; i < 3; i++) {
			await service.requestConfirmation(slow.id, orgId, ADMIN);
			await backdate(db, slow.id, RESEND_INTERVAL_MS + 1000);
		}

		const next = await seedEmailChannel(db, orgId);
		expect(await service.requestConfirmation(next.id, orgId, ADMIN)).toBe("sent");
	});

	test("a failed resend leaves the earlier link working", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await backdate(db, channel.id, RESEND_INTERVAL_MS + 1000);
		const failing = new EmailChannelService(db, () => Promise.reject(new Error("smtp down")));

		await expect(failing.requestConfirmation(channel.id, orgId, ADMIN)).rejects.toThrow(
			"smtp down",
		);
		expect((await service.lookup(channel.token))?.state).toBe("pending");
	});

	test("a channel saved without a token gets one", async ({ db: { db } }) => {
		const { orgId, sent, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await db
			.update(notificationChannel)
			.set({ token: null })
			.where(eq(notificationChannel.id, channel.id));

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
		expect(await service.confirm(sent[0].token)).toBe(true);
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

const eventsOf = (db: TestDb["db"], orgId: string) =>
	db.select().from(notificationEvent).where(eq(notificationEvent.organizationId, orgId));
const sendsOf = (db: TestDb["db"], orgId: string) =>
	db
		.select()
		.from(channelConfirmationSend)
		.where(eq(channelConfirmationSend.organizationId, orgId));
const queuedPayload = async (db: TestDb["db"], orgId: string) => {
	const [event] = await eventsOf(db, orgId);
	return v.parse(ChannelConfirmationPayload, event.payload);
};

describe("EmailChannelService.queueConfirmation", () => {
	test("takes the slot and leaves the email to the worker", async ({ db: { db } }) => {
		const { orgId, send, sent, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);

		await service.queueConfirmation(channel.id, orgId, ADMIN);

		expect(send).not.toHaveBeenCalled();
		expect((await service.lookup(channel.token))?.state).toBe("pending");
		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("too_soon");

		const payload = await queuedPayload(db, orgId);
		expect(JSON.stringify(payload)).not.toContain(channel.token);

		expect(await service.sendQueued(orgId, payload)).toBe("sent");
		expect(sent).toEqual([
			{ email: "stranger@example.com", token: channel.token, requestedBy: ADMIN.email },
		]);
	});

	test("confirms a verified member's address without queueing", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const userId = await seedMember(db, orgId);
		const channel = await seedEmailChannel(db, orgId, `${userId}@example.com`);

		await service.queueConfirmation(channel.id, orgId, ADMIN);

		expect((await service.lookup(channel.token))?.state).toBe("confirmed");
		expect(await eventsOf(db, orgId)).toEqual([]);
	});

	test("a failed queued send gives the slot back", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.queueConfirmation(channel.id, orgId, ADMIN);
		send.mockRejectedValueOnce(new Error("SMTP down"));

		const payload = await queuedPayload(db, orgId);

		expect(await service.sendQueued(orgId, payload)).toEqual({ failure: new Error("SMTP down") });

		expect(await sendsOf(db, orgId)).toEqual([]);
		expect((await service.lookup(channel.token))?.state).toBe("expired");
		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
	});

	test("a retried row whose slot went back sends nothing", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.queueConfirmation(channel.id, orgId, ADMIN);
		const payload = await queuedPayload(db, orgId);
		send.mockRejectedValueOnce(new Error("SMTP down"));
		await service.sendQueued(orgId, payload);

		expect(await service.sendQueued(orgId, payload)).toBe("skipped");
		expect(send).toHaveBeenCalledTimes(1);
	});

	test("counts once against the ceiling, however late it leaves", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId, "late-bounce@example.com");
		await service.queueConfirmation(channel.id, orgId, ADMIN);
		await db
			.update(unsolicitedMailSend)
			.set({ sentAt: new Date(Date.now() - HOUR_MS) })
			.where(eq(unsolicitedMailSend.organizationId, orgId));

		await service.sendQueued(orgId, await queuedPayload(db, orgId));
		await recordMailFailure(db, "evt-late", {
			kind: "bounce",
			recipients: ["late-bounce@example.com"],
			sentAt: new Date(),
		});

		const sends = await db
			.select()
			.from(unsolicitedMailSend)
			.where(eq(unsolicitedMailSend.organizationId, orgId));
		expect(sends).toHaveLength(1);
		const [event] = await db.select().from(mailEvent).where(eq(mailEvent.id, "evt-late"));
		expect(event.organizationId).toBe(orgId);
	});

	test("does not mail an address suppressed while queued", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId, "bounced@example.com");
		await service.queueConfirmation(channel.id, orgId, ADMIN);
		await db.insert(emailSuppression).values({ email: "bounced@example.com", reason: "bounce" });

		expect(await service.sendQueued(orgId, await queuedPayload(db, orgId))).toBe("skipped");

		expect(send).not.toHaveBeenCalled();
		expect(await sendsOf(db, orgId)).toEqual([]);
		expect((await service.lookup(channel.token))?.state).toBe("expired");
	});

	test("does not mail for an organization blocked while queued", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.queueConfirmation(channel.id, orgId, ADMIN);
		await db.insert(organizationMailBlock).values({ organizationId: orgId, reason: "bounce" });

		expect(await service.sendQueued(orgId, await queuedPayload(db, orgId))).toBe("skipped");
		expect(send).not.toHaveBeenCalled();
	});

	test("skips an address readdressed away and back while queued", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.queueConfirmation(channel.id, orgId, ADMIN);
		await db
			.update(notificationChannel)
			.set(freshRecipient())
			.where(eq(notificationChannel.id, channel.id));

		expect(await service.sendQueued(orgId, await queuedPayload(db, orgId))).toBe("skipped");
		expect(send).not.toHaveBeenCalled();
	});

	test("skips an address that left the channel while queued", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.queueConfirmation(channel.id, orgId, ADMIN);
		await db
			.update(notificationChannel)
			.set({ config: { email: "other@example.com" }, ...freshRecipient() })
			.where(eq(notificationChannel.id, channel.id));

		expect(await service.sendQueued(orgId, await queuedPayload(db, orgId))).toBe("skipped");

		expect(send).not.toHaveBeenCalled();
		expect(await sendsOf(db, orgId)).toEqual([]);
	});

	test("skips an address that unsubscribed while queued", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.queueConfirmation(channel.id, orgId, ADMIN);
		await service.unsubscribe(channel.token);

		expect(await service.sendQueued(orgId, await queuedPayload(db, orgId))).toBe("skipped");
		expect(send).not.toHaveBeenCalled();
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

	test("the opt-out covers the address, not just the channel", async ({ db: { db } }) => {
		const { orgId, send, service } = await setup(db);
		const first = await seedEmailChannel(db, orgId, "ops@example.com");
		const second = await seedEmailChannel(db, orgId, "OPS@example.com");
		await service.requestConfirmation(first.id, orgId, ADMIN);
		await service.unsubscribe(first.token);

		expect((await service.lookup(second.token))?.state).toBe("unsubscribed");
		await db.delete(notificationChannel).where(eq(notificationChannel.id, first.id));
		expect(await service.recipientFor(orgId, "Ops@Example.com")).toMatchObject({
			unsubscribedAt: expect.any(Date),
			reaskedAt: null,
		});
		expect((await service.recipientFor(await seedOrg(db), "ops@example.com")).unsubscribedAt).toBe(
			null,
		);
		expect(send).toHaveBeenCalledTimes(1);
	});

	test("a re-ask goes out once, and a recreated channel cannot repeat it", async ({
		db: { db },
	}) => {
		const { orgId, send, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.unsubscribe(channel.token);
		await backdateSends(db, orgId);
		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");

		await backdateSends(db, orgId);
		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("reasked");

		await db.delete(notificationChannel).where(eq(notificationChannel.id, channel.id));
		const recreated = await seedEmailChannel(db, orgId);
		await db
			.update(notificationChannel)
			.set(await service.recipientFor(orgId, "stranger@example.com"))
			.where(eq(notificationChannel.id, recreated.id));
		expect(await service.requestConfirmation(recreated.id, orgId, ADMIN)).toBe("unsubscribed");
		expect(send).toHaveBeenCalledTimes(2);
	});

	test("an opted-out member's address is never confirmed for them", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const userId = await seedMember(db, orgId);
		const channel = await seedEmailChannel(db, orgId, `${userId}@example.com`);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.unsubscribe(channel.token);

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toBe("sent");
		expect((await service.lookup(channel.token))?.state).not.toBe("confirmed");
	});

	test("asking again within the interval says when it opens", async ({ db: { db } }) => {
		const { orgId, service, send } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.unsubscribe(channel.token);
		const sentAt = new Date(Date.now() - 10 * 60_000);
		await db
			.update(channelConfirmationSend)
			.set({ sentAt })
			.where(eq(channelConfirmationSend.organizationId, orgId));

		expect(await service.requestConfirmation(channel.id, orgId, ADMIN)).toEqual({
			askAgainAt: new Date(sentAt.getTime() + RESEND_INTERVAL_MS),
		});
		expect(send).toHaveBeenCalledTimes(1);
		expect((await service.lookup(channel.token))?.state).toBe("unsubscribed");
	});

	test("a second channel to the same address waits out the interval", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const first = await seedEmailChannel(db, orgId);
		const second = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(first.id, orgId, ADMIN);

		expect(await service.requestConfirmation(second.id, orgId, ADMIN)).toBe("too_soon");
	});

	test("a recreated channel keeps a used re-ask", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const channel = await seedEmailChannel(db, orgId);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.unsubscribe(channel.token);
		await backdate(db, channel.id, RESEND_INTERVAL_MS + 1000);
		await service.requestConfirmation(channel.id, orgId, ADMIN);

		expect((await service.recipientFor(orgId, "stranger@example.com")).reaskedAt).toEqual(
			expect.any(Date),
		);
	});

	test("an unknown token is a no-op", async ({ db: { db } }) => {
		const { service } = await setup(db);

		await service.unsubscribe("nope");
		expect(await service.lookup("nope")).toBeNull();
	});
});

describe("EmailChannelService.confirmMemberAddress", () => {
	test("confirms the member's address in their organizations only", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const userId = await seedMember(db, orgId);
		const address = `${userId}@example.com`;
		const own = await seedEmailChannel(db, orgId, address.toUpperCase());
		const elsewhere = await seedEmailChannel(db, await seedOrg(db), address);

		await service.confirmMemberAddress(address);

		expect((await service.lookup(own.token))?.state).toBe("confirmed");
		expect((await service.lookup(elsewhere.token))?.state).not.toBe("confirmed");
	});

	test("leaves a re-asked address alone until it confirms", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const userId = await seedMember(db, orgId);
		const channel = await seedEmailChannel(db, orgId, `${userId}@example.com`);
		await service.requestConfirmation(channel.id, orgId, ADMIN);
		await service.unsubscribe(channel.token);
		await service.requestConfirmation(channel.id, orgId, ADMIN);

		await service.confirmMemberAddress(`${userId}@example.com`);

		const [row] = await db
			.select({ verifiedAt: notificationChannel.verifiedAt })
			.from(notificationChannel)
			.where(eq(notificationChannel.id, channel.id));
		expect(row.verifiedAt).toBeNull();
	});

	test("leaves an unsubscribed address alone", async ({ db: { db } }) => {
		const { orgId, service } = await setup(db);
		const userId = await seedMember(db, orgId);
		const channel = await seedEmailChannel(db, orgId, `${userId}@example.com`);
		await service.unsubscribe(channel.token);

		await service.confirmMemberAddress(`${userId}@example.com`);

		expect((await service.lookup(channel.token))?.state).toBe("unsubscribed");
	});
});

describe("EmailChannelService.suppressedChannelIds", () => {
	test("names confirmed channels of this organization whose address is suppressed", async ({
		db: { db },
	}) => {
		const { orgId, service } = await setup(db);
		const other = await setup(db);
		await db.insert(emailSuppression).values({ email: "gone@example.com", reason: "bounce" });
		const confirmed = await seedEmailChannel(db, orgId, "Gone@example.com");
		await seedEmailChannel(db, orgId, "gone@example.com");
		const healthy = await seedEmailChannel(db, orgId, "fine@example.com");
		const foreign = await seedEmailChannel(db, other.orgId, "gone@example.com");
		await db
			.update(notificationChannel)
			.set({ verifiedAt: new Date() })
			.where(inArray(notificationChannel.id, [confirmed.id, healthy.id, foreign.id]));

		expect(await service.suppressedChannelIds(orgId)).toEqual(new Set([confirmed.id]));
	});
});
