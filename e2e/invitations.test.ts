import { randomUUID } from "node:crypto";

import { expect, gotoHydrated, register, test } from "./fixtures";

test("an instance without mail refuses to invite and keeps no invitation", async ({
	page,
	sql,
	organizationId,
}) => {
	await gotoHydrated(page, "/settings/organisation");
	await page.getByRole("button", { name: "Invite" }).click();
	await page.getByLabel("Email").fill(`e2e-${randomUUID()}@example.com`);
	await page.getByRole("button", { name: "Send Invitation" }).click();

	await expect(page.getByText("no mail server configured")).toBeVisible();
	const rows = await sql`SELECT id FROM invitation WHERE organization_id = ${organizationId}`;
	expect(rows).toHaveLength(0);
});

test("only the invited address, once verified, can see and accept an invitation", async ({
	browser,
	sql,
	organizationId,
}) => {
	const [{ inviterId }] = await sql<{ inviterId: string }[]>`
		SELECT user_id AS "inviterId" FROM member WHERE organization_id = ${organizationId}
	`;
	const id = randomUUID();
	const organizationName = `Org ${id}`;
	await sql`UPDATE organization SET name = ${organizationName} WHERE id = ${organizationId}`;
	const email = `e2e-${id}@example.com`;
	const link = `/invitations/${id}`;
	await sql`
		INSERT INTO invitation (id, organization_id, email, role, status, expires_at, created_at, inviter_id)
		VALUES (${id}, ${organizationId}, ${email}, 'member', 'pending',
			now() + interval '1 day', now(), ${inviterId})
	`;

	const invitee = await browser.newPage();
	await gotoHydrated(invitee, link);
	await expect(invitee.getByText(organizationName)).toBeHidden();
	const signUp = await invitee.getByRole("link", { name: "Create account" }).getAttribute("href");
	await register(invitee, { email, from: signUp!, to: `**${link}` });

	await expect(invitee.getByText("Verify your email address to open")).toBeVisible();
	await expect(invitee.getByText(organizationName)).toBeHidden();

	const stranger = await browser.newPage();
	const strangerEmail = await register(stranger);
	await sql`UPDATE "user" SET email_verified = true WHERE email IN (${email}, ${strangerEmail})`;
	await gotoHydrated(stranger, link);
	await expect(stranger.getByText("different address")).toBeVisible();
	await expect(stranger.getByText(organizationName)).toBeHidden();
	await stranger.close();

	await gotoHydrated(invitee, "/dashboard");
	await invitee.getByRole("link", { name: "View invitation" }).click();
	await expect(invitee.getByText(`join ${organizationName}`)).toBeVisible();
	await invitee.getByRole("button", { name: "Accept" }).click();
	await invitee.waitForURL("**/dashboard");
	await expect(invitee.getByText("Team invitations")).toBeHidden();

	const members = await sql`
		SELECT m.id FROM member m JOIN "user" u ON u.id = m.user_id
		WHERE m.organization_id = ${organizationId} AND u.email = ${email}
	`;
	expect(members).toHaveLength(1);
});
