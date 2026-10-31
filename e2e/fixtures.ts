import { randomInt, randomUUID } from "node:crypto";

import { test as base, type Page } from "@playwright/test";
import postgres from "postgres";

import { E2E_DATABASE_URL } from "./env";

const PASSWORD = "e2e-Passw0rd!";

/**
 * Pages submit forms natively until hydration finishes, so a click that lands too
 * early reloads the page instead of running its handler.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await page.waitForLoadState("networkidle");
}

export async function register(
	page: Page,
	{ email = `e2e-${randomUUID()}@example.com`, from = "/register", to = "**/dashboard" } = {},
): Promise<string> {
	await gotoHydrated(page, from);
	await page.getByLabel("Name").fill("E2E User");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByLabel("Confirm Password").fill(PASSWORD);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL(to);
	return email;
}

export const test = base.extend<{ organizationId: string }, { sql: postgres.Sql }>({
	extraHTTPHeaders: async ({}, use) => {
		await use({ "x-real-ip": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
	},
	sql: [
		async ({}, use) => {
			const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
			await use(sql);
			await sql.end({ timeout: 5 });
		},
		{ scope: "worker" },
	],
	/** Signs `page` up as a fresh user and yields the organization created for them. */
	organizationId: async ({ page, sql }, use) => {
		const email = await register(page);
		const [row] = await sql<{ organizationId: string }[]>`
			SELECT m.organization_id AS "organizationId"
			FROM member m JOIN "user" u ON u.id = m.user_id
			WHERE u.email = ${email}
		`;
		if (!row) throw new Error(`No organization for ${email}`);
		await use(row.organizationId);
	},
});

export { expect } from "@playwright/test";
