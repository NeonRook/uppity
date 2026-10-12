import type { Page } from "@playwright/test";
import type postgres from "postgres";

import { expect, gotoHydrated, test } from "./fixtures";

const LOAD_FAILED = "Couldn't load this page.";

interface List {
	path: string;
	insert(sql: postgres.Sql, organizationId: string, name: string): Promise<unknown>;
	openDelete(page: Page, name: string): Promise<void>;
}

/** Cards with a labelled delete button: incidents, channels, status pages. */
async function openCardDelete(page: Page, name: string): Promise<void> {
	await page
		.locator('[data-slot="card"]', { hasText: name })
		.getByRole("button", { name: "Delete" })
		.click();
}

async function openMonitorMenu(page: Page, name: string): Promise<void> {
	await page.getByRole("row", { name }).getByRole("button", { name: "Actions" }).click();
}

const lists: List[] = [
	{
		path: "/monitors",
		insert: (sql, org, name) =>
			sql`INSERT INTO monitor (id, organization_id, name, type, url, active)
				VALUES (${crypto.randomUUID()}, ${org}, ${name}, 'http', 'https://example.com', false)`,
		openDelete: async (page, name) => {
			await openMonitorMenu(page, name);
			await page.getByRole("menuitem", { name: "Delete" }).click();
		},
	},
	{
		path: "/incidents",
		insert: (sql, org, name) =>
			sql`INSERT INTO incident (id, organization_id, title) VALUES (${crypto.randomUUID()}, ${org}, ${name})`,
		openDelete: openCardDelete,
	},
	{
		path: "/notifications",
		insert: (sql, org, name) =>
			sql`INSERT INTO notification_channel (id, organization_id, name, type, config)
				VALUES (${crypto.randomUUID()}, ${org}, ${name}, 'webhook', ${sql.json({ url: "https://example.com" })})`,
		openDelete: openCardDelete,
	},
	{
		path: "/status-pages",
		insert: (sql, org, name) =>
			sql`INSERT INTO status_page (id, organization_id, name, slug)
				VALUES (${crypto.randomUUID()}, ${org}, ${name}, ${crypto.randomUUID()})`,
		openDelete: openCardDelete,
	},
];

for (const list of lists) {
	test(`deleting from ${list.path} removes the row in place`, async ({
		page,
		sql,
		organizationId,
	}) => {
		await list.insert(sql, organizationId, "Kept");
		await list.insert(sql, organizationId, "Doomed");
		await gotoHydrated(page, list.path);

		await list.openDelete(page, "Doomed");
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

		await expect(page.getByText("Doomed", { exact: true })).toHaveCount(0);
		await expect(page.getByText("Kept", { exact: true }).filter({ visible: true })).toBeVisible();
		await expect(page.getByText(LOAD_FAILED)).toHaveCount(0);

		await page.reload();
		await expect(page.getByText("Kept", { exact: true }).filter({ visible: true })).toBeVisible();
		await expect(page.getByText("Doomed", { exact: true })).toHaveCount(0);
	});
}

test("resuming a monitor from the list updates its row", async ({ page, sql, organizationId }) => {
	await lists[0].insert(sql, organizationId, "Sleeper");
	await gotoHydrated(page, "/monitors");
	const row = page.getByRole("row", { name: "Sleeper" });
	await expect(row.getByText("Paused", { exact: true })).toBeVisible();

	await openMonitorMenu(page, "Sleeper");
	await page.getByRole("menuitem", { name: "Resume" }).click();

	await expect(row.getByText("Paused", { exact: true })).toHaveCount(0);
	await expect(page.getByText(LOAD_FAILED)).toHaveCount(0);
});

test("a refused delete says why", async ({ page, sql, organizationId }) => {
	await lists[0].insert(sql, organizationId, "Ghost");
	await gotoHydrated(page, "/monitors");
	await sql`DELETE FROM monitor WHERE organization_id = ${organizationId}`;

	await lists[0].openDelete(page, "Ghost");
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

	await expect(page.getByText("Monitor not found")).toBeVisible();
});

test("the incidents list follows the resolved filter", async ({ page, sql, organizationId }) => {
	await sql`INSERT INTO incident (id, organization_id, title, status, resolved_at)
		VALUES (${crypto.randomUUID()}, ${organizationId}, 'Old news', 'resolved', now())`;
	await gotoHydrated(page, "/incidents");
	await expect(page.getByText("Old news")).toHaveCount(0);

	await page.getByRole("link", { name: "Show Resolved" }).click();
	await expect(page.getByText("Old news")).toBeVisible();

	await page.getByRole("link", { name: "Hide Resolved" }).click();
	await expect(page.getByText("Old news")).toHaveCount(0);
});
