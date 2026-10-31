import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, vi } from "vitest";

import { invitation, member, user } from "../db/auth-schema";
import { channelConfirmationSend, emailOptOut } from "../db/schema";
import type { TeamInvitation } from "../subscriber-email";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedOrg, seedUser } from "../test/seed";
import { EmailChannelService, RESEND_INTERVAL_MS } from "./email-channel.service";
import { InvitationService } from "./invitation.service";

const HOUR_MS = 60 * 60_000;
const INVITER = { email: "admin@example.com", emailVerified: true };
const INVITEE = { email: "invitee@example.com", emailVerified: true };

async function setup(db: TestDb["db"], { cap = 2, mail = true } = {}) {
	const organizationId = await seedOrg(db);
	const inviterId = await seedUser(db);
	const membership = { id: nanoid(), organizationId, userId: inviterId, createdAt: new Date() };
	await db.insert(member).values(membership);
	const send = vi.fn(async (_: TeamInvitation) => {});
	const sends = new EmailChannelService(db, vi.fn(), cap);
	const service = new InvitationService(db, sends, mail ? send : null);

	const invite = async (email = INVITEE.email, expiresIn = 48 * HOUR_MS) => {
		const id = `inv-${nanoid()}`;
		await db.insert(invitation).values({
			id,
			organizationId,
			email,
			role: "member",
			status: "pending",
			expiresAt: new Date(Date.now() + expiresIn),
			createdAt: new Date(),
			inviterId,
		});
		return { id, email, organizationId };
	};
	const exists = async (id: string) =>
		(await db.select().from(invitation).where(eq(invitation.id, id))).length > 0;
	const logged = () =>
		db
			.select()
			.from(channelConfirmationSend)
			.where(eq(channelConfirmationSend.organizationId, organizationId));

	const removeInviter = () => db.delete(member).where(eq(member.id, membership.id));

	return { organizationId, inviterId, send, sends, service, invite, exists, logged, removeInviter };
}

describe("deliver", () => {
	test("mails the invitation with the inviter's address and takes a slot", async ({
		db: { db },
	}) => {
		const { service, invite, send, exists, logged } = await setup(db);
		const created = await invite();

		await expect(service.deliver(created, INVITER)).resolves.toBe("sent");

		expect(send).toHaveBeenCalledWith({
			email: INVITEE.email,
			invitationId: created.id,
			invitedBy: INVITER.email,
		});
		expect(await exists(created.id)).toBe(true);
		expect(await logged()).toHaveLength(1);
	});

	test("deletes the invitation when no mail server is configured", async ({ db: { db } }) => {
		const { service, invite, exists, logged } = await setup(db, { mail: false });
		const created = await invite();

		await expect(service.deliver(created, INVITER)).resolves.toBe("no_mail");

		expect(await exists(created.id)).toBe(false);
		expect(await logged()).toHaveLength(0);
	});

	test("sends nothing for an unverified inviter", async ({ db: { db } }) => {
		const { service, invite, send, exists } = await setup(db);
		const created = await invite();

		await expect(service.deliver(created, { ...INVITER, emailVerified: false })).resolves.toBe(
			"unverified",
		);

		expect(send).not.toHaveBeenCalled();
		expect(await exists(created.id)).toBe(false);
	});

	test("a failed send frees the seat and the slot", async ({ db: { db } }) => {
		const { service, invite, send, exists, logged } = await setup(db);
		send.mockRejectedValueOnce(new Error("smtp down"));
		const created = await invite();

		await expect(service.deliver(created, INVITER)).resolves.toBe("failed");

		expect(await exists(created.id)).toBe(false);
		expect(await logged()).toHaveLength(0);
	});

	test("cancelling and inviting again waits out the resend interval", async ({ db: { db } }) => {
		const { service, invite, send } = await setup(db);
		await service.deliver(await invite(), INVITER);

		await expect(service.deliver(await invite(), INVITER)).resolves.toBe("too_soon");

		expect(send).toHaveBeenCalledOnce();
	});

	test("invitations and channel confirmations share the organization's cap", async ({
		db: { db },
	}) => {
		const { service, invite, organizationId, send, exists } = await setup(db, { cap: 2 });
		await db.insert(channelConfirmationSend).values({
			id: nanoid(),
			organizationId,
			email: "channel@example.com",
			sentAt: new Date(Date.now() - RESEND_INTERVAL_MS),
		});
		await service.deliver(await invite("one@example.com"), INVITER);
		const refused = await invite("two@example.com");

		await expect(service.deliver(refused, INVITER)).resolves.toBe("capped");

		expect(send).toHaveBeenCalledOnce();
		expect(await exists(refused.id)).toBe(false);
	});

	test("an accepted invitation frees its slot", async ({ db: { db } }) => {
		const { service, sends, invite, organizationId } = await setup(db, { cap: 1 });
		const first = await invite("one@example.com");
		await service.deliver(first, INVITER);

		await sends.markInvitationAccepted(organizationId, first.email.toUpperCase());

		await expect(service.deliver(await invite("two@example.com"), INVITER)).resolves.toBe("sent");
	});

	test("an address that opted out of the organization is not invited", async ({ db: { db } }) => {
		const { service, invite, organizationId, send } = await setup(db);
		await db.insert(emailOptOut).values({
			organizationId,
			email: INVITEE.email,
			unsubscribedAt: new Date(),
		});

		await expect(service.deliver(await invite(), INVITER)).resolves.toBe("opted_out");

		expect(send).not.toHaveBeenCalled();
	});
});

describe("viewFor", () => {
	test("shows the organization and inviter to the verified recipient, ignoring case", async ({
		db: { db },
	}) => {
		const { service, invite, inviterId } = await setup(db);
		const { id } = await invite();
		const [{ email }] = await db.select().from(user).where(eq(user.id, inviterId));

		const view = await service.viewFor(id, { ...INVITEE, email: "Invitee@Example.com" });

		expect(view).toMatchObject({
			state: "pending",
			invitation: { id, invitedBy: email, organizationName: expect.any(String) },
		});
	});

	test("hides everything from a verified account with another address", async ({ db: { db } }) => {
		const { service, invite } = await setup(db);
		const { id } = await invite();

		await expect(service.viewFor(id, INVITER)).resolves.toEqual({ state: "other_account" });
	});

	test("hides everything from an unverified account with the invited address", async ({
		db: { db },
	}) => {
		const { service, invite } = await setup(db);
		const { id } = await invite();

		await expect(service.viewFor(id, { ...INVITEE, emailVerified: false })).resolves.toEqual({
			state: "unverified",
		});
	});

	test("does not name an inviter who is no longer verified", async ({ db: { db } }) => {
		const { service, invite, inviterId } = await setup(db);
		const { id } = await invite();
		await db.update(user).set({ emailVerified: false }).where(eq(user.id, inviterId));

		await expect(service.viewFor(id, INVITEE)).resolves.toMatchObject({
			invitation: { invitedBy: null },
		});
	});

	test("treats expired, answered and unknown invitations alike", async ({ db: { db } }) => {
		const { service, invite } = await setup(db);
		const expired = await invite(INVITEE.email, -HOUR_MS);
		const accepted = await invite();
		await db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, accepted.id));

		for (const id of [expired.id, accepted.id, "unknown"]) {
			await expect(service.viewFor(id, INVITEE)).resolves.toEqual({ state: "invalid" });
		}
	});
});

describe("accept", () => {
	test("refuses a second accept in the organization while one runs", async ({ db: { db } }) => {
		const { service, invite } = await setup(db);
		const [first, second] = [await invite("one@example.com"), await invite("two@example.com")];
		const inner = vi.fn(async () => {});

		await service.accept(first.id, async () => {
			await expect(service.accept(second.id, inner)).rejects.toMatchObject({ statusCode: 409 });
		});

		expect(inner).not.toHaveBeenCalled();
		await service.accept(second.id, inner);
		expect(inner).toHaveBeenCalledOnce();
	});

	test("refuses an invitation whose sender left the organization", async ({ db: { db } }) => {
		const { service, invite, removeInviter } = await setup(db);
		const { id } = await invite();
		await removeInviter();
		const accept = vi.fn(async () => {});

		await expect(service.accept(id, accept)).rejects.toMatchObject({ statusCode: 400 });

		expect(accept).not.toHaveBeenCalled();
		await expect(service.viewFor(id, INVITEE)).resolves.toEqual({ state: "invalid" });
	});
});

describe("pendingFor", () => {
	test("lists only live invitations to a verified address", async ({ db: { db } }) => {
		const { service, invite } = await setup(db);
		const reader = { email: "listed@example.com", emailVerified: true };
		const live = await invite(reader.email);
		await invite(reader.email, -HOUR_MS);
		await invite("someone-else@example.com");

		expect((await service.pendingFor(reader)).map(({ id }) => id)).toEqual([live.id]);
		await expect(service.pendingFor({ ...reader, emailVerified: false })).resolves.toEqual([]);
	});
});
