import { createEmailVerificationToken } from "better-auth/api";

import { AUTH_SECRET } from "./env";
import { expect, gotoHydrated, register, test } from "./fixtures";

test("only the account's own session can verify its address", async ({
	page,
	browser,
	sql,
	organizationId,
}) => {
	const [owner] = await sql<{ id: string; email: string }[]>`
		SELECT u.id, u.email FROM "user" u JOIN member m ON m.user_id = u.id
		WHERE m.organization_id = ${organizationId}
	`;
	const link = `/verify-email?token=${await createEmailVerificationToken(AUTH_SECRET, owner.email)}`;
	const verified = async () =>
		(await sql<{ v: boolean }[]>`SELECT email_verified AS v FROM "user" WHERE id = ${owner.id}`)[0]
			.v;

	const stranger = await browser.newPage();
	await stranger.goto(link);
	await expect(stranger).toHaveURL(/\/login\?redirectTo=/);
	await register(stranger);
	await gotoHydrated(stranger, link);
	await expect(stranger.getByText("verifies a different account")).toBeVisible();
	await stranger.close();
	expect(await verified()).toBe(false);

	await gotoHydrated(page, link);
	await expect(page).toHaveURL(/\/dashboard/);
	expect(await verified()).toBe(true);
});
