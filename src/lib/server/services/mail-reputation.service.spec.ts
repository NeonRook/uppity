import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, vi } from "vitest";

import {
	emailSuppression,
	mailEvent,
	notificationChannel,
	organizationMailBlock,
	statusPage,
	unsolicitedMailSend,
} from "../db/schema";
import type { ChannelConfirmation } from "../notifications/email";
import { raiseOpsAlert } from "../ops-alert";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedOrg } from "../test/seed";
import { EmailChannelService, freshRecipient } from "./email-channel.service";
import { recordMailFailure, UnsolicitedMailGuard } from "./mail-reputation.service";
import { StatusPageSubscriberService } from "./status-page-subscriber.service";

vi.mock("../ops-alert", async (original) => ({
	...(await original<typeof import("../ops-alert")>()),
	raiseOpsAlert: vi.fn(async () => {}),
}));

const THRESHOLDS = {
	windowDays: 30,
	bounceMin: 2,
	bouncePercent: 7,
	complaintMin: 2,
	complaintPerMille: 3,
};

const address = () => `${nanoid().toLowerCase()}@example.com`;

async function logSend(db: TestDb["db"], organizationId: string, email: string, sentAt: Date) {
	await db.insert(unsolicitedMailSend).values({ id: nanoid(), organizationId, email, sentAt });
}

async function isBlocked(db: TestDb["db"], organizationId: string) {
	const rows = await db
		.select()
		.from(organizationMailBlock)
		.where(eq(organizationMailBlock.organizationId, organizationId));
	return rows.length > 0;
}

async function eventOrg(db: TestDb["db"], id: string) {
	const [row] = await db.select().from(mailEvent).where(eq(mailEvent.id, id));
	return row?.organizationId;
}

const bounce = (email: string, sentAt = new Date()) => ({
	kind: "bounce" as const,
	recipients: [email],
	sentAt,
});

async function seedPage(db: TestDb["db"], organizationId: string) {
	const id = `sp-${nanoid().toLowerCase()}`;
	await db.insert(statusPage).values({ id, organizationId, name: "Acme", slug: id });
	return { id, organizationId };
}

async function seedChannel(db: TestDb["db"], organizationId: string, email: string) {
	const id = `ch-${nanoid()}`;
	await db.insert(notificationChannel).values({
		id,
		organizationId,
		name: "Ops",
		type: "email",
		config: { email },
		...freshRecipient(),
	});
	return id;
}

const ADMIN = { email: "admin@example.com", emailVerified: true };

describe("recordMailFailure attribution", () => {
	test("charges the organization whose send sits closest to the email's time", async ({ db }) => {
		const [early, late] = [await seedOrg(db.db), await seedOrg(db.db)];
		const email = address();
		const now = Date.now();
		await logSend(db.db, early, email, new Date(now - 60_000));
		await logSend(db.db, late, email, new Date(now - 2_000));
		const eventId = nanoid();

		await recordMailFailure(db.db, eventId, bounce(email, new Date(now)), THRESHOLDS);

		expect(await eventOrg(db.db, eventId)).toBe(late);
	});

	test("charges nobody for mail outside our send record, and still suppresses", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		const email = address();
		await logSend(db.db, orgId, email, new Date(Date.now() - 60 * 60_000));
		const eventId = nanoid();

		await recordMailFailure(db.db, eventId, bounce(email), THRESHOLDS);

		expect(await eventOrg(db.db, eventId)).toBeNull();
		const rows = await db.db
			.select()
			.from(emailSuppression)
			.where(eq(emailSuppression.email, email));
		expect(rows).toHaveLength(1);
	});

	test("charges nobody when the event does not say when the email was sent", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		const email = address();
		await logSend(db.db, orgId, email, new Date());
		const eventId = nanoid();

		await recordMailFailure(
			db.db,
			eventId,
			{ kind: "complaint", recipients: [email], sentAt: null },
			THRESHOLDS,
		);

		expect(await eventOrg(db.db, eventId)).toBeNull();
	});

	test("a retried event counts once", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		const email = address();
		await logSend(db.db, orgId, email, new Date());
		const eventId = nanoid();

		await recordMailFailure(db.db, eventId, bounce(email), THRESHOLDS);
		await recordMailFailure(db.db, eventId, bounce(email), THRESHOLDS);

		expect(await isBlocked(db.db, orgId)).toBe(false);
	});
});

describe("organization block", () => {
	test("blocks at the bounce minimum and tells the operator once", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		const [first, second, third] = [address(), address(), address()];
		for (const email of [first, second, third]) await logSend(db.db, orgId, email, new Date());
		vi.mocked(raiseOpsAlert).mockClear();

		await recordMailFailure(db.db, nanoid(), bounce(first), THRESHOLDS);
		expect(await isBlocked(db.db, orgId)).toBe(false);

		await recordMailFailure(db.db, nanoid(), bounce(second), THRESHOLDS);
		await recordMailFailure(db.db, nanoid(), bounce(third), THRESHOLDS);

		expect(await isBlocked(db.db, orgId)).toBe(true);
		expect(raiseOpsAlert).toHaveBeenCalledTimes(1);
		expect(vi.mocked(raiseOpsAlert).mock.calls[0][1]).toMatchObject({
			type: "organization_mail_blocked",
			subject: orgId,
		});
	});

	test("a rate under the threshold does not block, however many bounces", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		const bounced = [address(), address()];
		for (const email of bounced) await logSend(db.db, orgId, email, new Date());
		await db.db.insert(unsolicitedMailSend).values(
			Array.from({ length: 100 }, () => ({
				id: nanoid(),
				organizationId: orgId,
				email: address(),
			})),
		);

		for (const email of bounced)
			await recordMailFailure(db.db, nanoid(), bounce(email), THRESHOLDS);

		expect(await isBlocked(db.db, orgId)).toBe(false);
	});

	test("blocks on complaints", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		const [first, second] = [address(), address()];
		for (const email of [first, second]) await logSend(db.db, orgId, email, new Date());

		for (const email of [first, second]) {
			await recordMailFailure(
				db.db,
				nanoid(),
				{ kind: "complaint", recipients: [email], sentAt: new Date() },
				THRESHOLDS,
			);
		}

		const [block] = await db.db
			.select()
			.from(organizationMailBlock)
			.where(eq(organizationMailBlock.organizationId, orgId));
		expect(block.reason).toBe("complaint");
	});

	test("refuses all three kinds of unsolicited mail, and leaves other organizations alone", async ({
		db,
	}) => {
		const blocked = await seedOrg(db.db, { subscriberEmailEnabled: true });
		const other = await seedOrg(db.db);
		await db.db.insert(organizationMailBlock).values({ organizationId: blocked, reason: "bounce" });
		const send = vi.fn(async (_: ChannelConfirmation) => {});
		const channels = new EmailChannelService(db.db, send);
		const subscribers = new StatusPageSubscriberService(db.db, vi.fn());

		const channel = await seedChannel(db.db, blocked, address());
		const invitation = await channels.claimInvitationSend(blocked, address());
		const subscribe = await subscribers.subscribe(await seedPage(db.db, blocked), address());
		const allowed = await channels.claimInvitationSend(other, address());

		expect(await channels.requestConfirmation(channel, blocked, ADMIN)).toBe("blocked");
		expect(invitation.refused).toBe("blocked");
		expect(subscribe).toBe("paused");
		expect(send).not.toHaveBeenCalled();
		expect(allowed.refused).toBeUndefined();
	});
});

/** Empties the send record, which the ceiling counts across the whole file. */
async function fresh(db: TestDb["db"]) {
	await db.delete(unsolicitedMailSend);
	vi.mocked(raiseOpsAlert).mockClear();
	return seedOrg(db, { subscriberEmailEnabled: true });
}

describe("UnsolicitedMailGuard ceiling", () => {
	test("counts every organization and tells the operator", async ({ db }) => {
		const orgId = await fresh(db.db);
		const guard = new UnsolicitedMailGuard(db.db, 2);
		const channels = new EmailChannelService(db.db, vi.fn(), 5, guard);
		const subscribers = new StatusPageSubscriberService(db.db, vi.fn(), undefined, guard);

		const first = await channels.claimInvitationSend(orgId, address());
		const second = await channels.claimInvitationSend(await seedOrg(db.db), address());
		const third = await channels.claimInvitationSend(orgId, address());
		const fourth = await subscribers.subscribe(await seedPage(db.db, orgId), address());

		expect([first.refused, second.refused, third.refused]).toEqual([
			undefined,
			undefined,
			"ceiling",
		]);
		expect(fourth).toBe("paused");
		expect(vi.mocked(raiseOpsAlert).mock.calls[0][1]).toMatchObject({
			type: "unsolicited_mail_ceiling",
		});
	});

	test("sends older than a day no longer count", async ({ db }) => {
		const orgId = await fresh(db.db);
		await logSend(db.db, orgId, address(), new Date(Date.now() - 25 * 60 * 60_000));

		const guard = new UnsolicitedMailGuard(db.db, 1);

		expect(await guard.refusal(db.db, orgId, address())).toBeNull();
	});

	test("zero turns the ceiling off", async ({ db }) => {
		const orgId = await fresh(db.db);
		await logSend(db.db, orgId, address(), new Date());

		const guard = new UnsolicitedMailGuard(db.db, 0);

		expect(await guard.refusal(db.db, orgId, address())).toBeNull();
	});

	test("concurrent claims cannot pass it together", async ({ db }) => {
		const orgId = await fresh(db.db);
		const guard = new UnsolicitedMailGuard(db.db, 1);
		const channels = new EmailChannelService(db.db, vi.fn(), 5, guard);
		const orgs = [orgId, await seedOrg(db.db), await seedOrg(db.db)];

		const claims = await Promise.all(orgs.map((id) => channels.claimInvitationSend(id, address())));

		expect(claims.filter((claim) => !claim.refused)).toHaveLength(1);
	});

	test("a send that failed gives its place back", async ({ db }) => {
		const orgId = await fresh(db.db);
		const channels = new EmailChannelService(db.db, vi.fn());

		const claim = await channels.claimInvitationSend(orgId, address());
		if (!claim.refused) await channels.releaseSend(claim.sendId);

		expect(await db.db.select().from(unsolicitedMailSend)).toHaveLength(0);
	});
});

describe("addresses typed into a public form", () => {
	test("bounces never block the page's organization", async ({ db }) => {
		const orgId = await fresh(db.db);
		const subscribers = new StatusPageSubscriberService(db.db, vi.fn());
		const channels = new EmailChannelService(db.db, vi.fn());
		const page = await seedPage(db.db, orgId);
		const dead = Array.from({ length: 10 }, address);
		const eventIds = dead.map(() => nanoid());

		for (const email of dead) await subscribers.subscribe(page, email);
		for (const [i, email] of dead.entries()) {
			await recordMailFailure(db.db, eventIds[i], bounce(email), THRESHOLDS);
		}

		expect(await isBlocked(db.db, orgId)).toBe(false);
		expect(await eventOrg(db.db, eventIds[0])).toBeNull();
		expect((await channels.claimInvitationSend(orgId, address())).refused).toBeUndefined();
		const suppressed = await db.db
			.select()
			.from(emailSuppression)
			.where(eq(emailSuppression.email, dead[0]));
		expect(suppressed).toHaveLength(1);
	});

	test("do not dilute the organization's own bounce rate", async ({ db }) => {
		const orgId = await fresh(db.db);
		const [first, second] = [address(), address()];
		for (const email of [first, second]) await logSend(db.db, orgId, email, new Date());
		await db.db.insert(unsolicitedMailSend).values(
			Array.from({ length: 100 }, () => ({
				id: nanoid(),
				organizationId: null,
				email: address(),
			})),
		);

		for (const email of [first, second]) {
			await recordMailFailure(db.db, nanoid(), bounce(email), THRESHOLDS);
		}

		expect(await isBlocked(db.db, orgId)).toBe(true);
	});

	test("may use half the ceiling, leaving the rest for organizations", async ({ db }) => {
		const orgId = await fresh(db.db);
		const guard = new UnsolicitedMailGuard(db.db, 2);
		const subscribers = new StatusPageSubscriberService(db.db, vi.fn(), undefined, guard);
		const channels = new EmailChannelService(db.db, vi.fn(), 5, guard);
		const page = await seedPage(db.db, orgId);

		expect(await subscribers.subscribe(page, address())).toBe("sent");
		expect(await subscribers.subscribe(page, address())).toBe("paused");
		expect((await channels.claimInvitationSend(orgId, address())).refused).toBeUndefined();
	});

	test("a paused form answers the same for a suppressed address", async ({ db }) => {
		const orgId = await fresh(db.db);
		await db.db.insert(organizationMailBlock).values({ organizationId: orgId, reason: "bounce" });
		const email = address();
		await db.db.insert(emailSuppression).values({ email, reason: "bounce" });
		const subscribers = new StatusPageSubscriberService(db.db, vi.fn());

		expect(await subscribers.subscribe(await seedPage(db.db, orgId), email)).toBe("paused");
	});
});

describe("suppressed addresses", () => {
	test("get no channel confirmation or invitation", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		const email = address();
		await db.db.insert(emailSuppression).values({ email, reason: "bounce" });
		const send = vi.fn(async (_: ChannelConfirmation) => {});
		const channels = new EmailChannelService(db.db, send);

		const channel = await seedChannel(db.db, orgId, email);

		expect(await channels.requestConfirmation(channel, orgId, ADMIN)).toBe("suppressed");
		expect((await channels.claimInvitationSend(orgId, email)).refused).toBe("suppressed");
		expect(send).not.toHaveBeenCalled();
	});
});
