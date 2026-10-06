import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";

import CapacityCard from "./capacity-card.svelte";

const { setCapacityBlocks, refreshAll, toast } = vi.hoisted(() => ({
	setCapacityBlocks: vi.fn(),
	refreshAll: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("#lib/remote/billing.remote.js", () => ({ setCapacityBlocks }));
vi.mock("$app/navigation", () => ({ refreshAll }));
vi.mock("svelte-sonner", () => ({ toast }));

beforeEach(() => {
	vi.clearAllMocks();
});

const base = {
	blocks: 2,
	scheduledBlocks: null,
	annual: false,
	canManage: true,
	periodEnd: "2026-03-12T00:00:00.000Z",
	monitorsUsed: 120,
};

describe("capacity-card.svelte", () => {
	it("previews the limit and monthly price as blocks are added", async () => {
		await render(CapacityCard, base);

		await expect.element(page.getByText("150", { exact: true })).toBeInTheDocument();
		await page.getByRole("button", { name: "Add a block" }).click();

		await expect.element(page.getByText("200", { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText("$36/month")).toBeInTheDocument();
	});

	it("rounds a monitor target up to whole blocks", async () => {
		await render(CapacityCard, base);

		await page.getByLabelText("Or enter how many monitors you need").fill("260");

		await expect.element(page.getByText("300", { exact: true })).toBeInTheDocument();
	});

	it("stops at the maximum and points to Dedicated", async () => {
		await render(CapacityCard, { ...base, blocks: 39 });

		await page.getByRole("button", { name: "Add a block" }).click();

		await expect.element(page.getByRole("button", { name: "Add a block" })).toBeDisabled();
		await expect.element(page.getByText(/Dedicated costs less/)).toBeInTheDocument();
	});

	it("shows a pending reduction with the date it lands", async () => {
		await render(CapacityCard, { ...base, scheduledBlocks: 1 });

		await expect
			.element(page.getByText("Your limit drops to 100 monitors on March 12, 2026."))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Keep current capacity" }))
			.toBeInTheDocument();
	});

	it("asks annual customers to confirm an increase, naming the amount", async () => {
		await render(CapacityCard, { ...base, annual: true });

		await page.getByRole("button", { name: "Add a block" }).click();
		await page.getByRole("button", { name: "Save changes" }).click();

		await expect
			.element(
				page.getByText(
					"On March 12, 2026 you'll be billed $240 for 150 extra monitors, even if you remove blocks before then.",
				),
			)
			.toBeInTheDocument();
		expect(setCapacityBlocks).not.toHaveBeenCalled();
	});

	it("is read-only for members who cannot manage billing", async () => {
		await render(CapacityCard, { ...base, canManage: false });

		await expect
			.element(page.getByText("Only owners and admins can change capacity."))
			.toBeInTheDocument();
		await expect.element(page.getByRole("button", { name: "Add a block" })).not.toBeInTheDocument();
	});

	it("saves a monthly change and refreshes the page", async () => {
		setCapacityBlocks.mockResolvedValue({ ok: true, blocks: 3, scheduledBlocks: null });
		await render(CapacityCard, base);

		await page.getByRole("button", { name: "Add a block" }).click();
		await page.getByRole("button", { name: "Save changes" }).click();

		await vi.waitFor(() => expect(refreshAll).toHaveBeenCalled());
		expect(setCapacityBlocks).toHaveBeenCalledWith({ blocks: 3 });
		expect(toast.success).toHaveBeenCalledWith("Capacity updated");
	});

	it("writes an annual increase once it is confirmed", async () => {
		setCapacityBlocks.mockResolvedValue({ ok: true, blocks: 3, scheduledBlocks: null });
		await render(CapacityCard, { ...base, annual: true });

		await page.getByRole("button", { name: "Add a block" }).click();
		await page.getByRole("button", { name: "Save changes" }).click();
		await page.getByRole("button", { name: "Add capacity" }).click();

		await vi.waitFor(() => expect(setCapacityBlocks).toHaveBeenCalledWith({ blocks: 3 }));
	});

	it("explains a refusal without refreshing", async () => {
		setCapacityBlocks.mockResolvedValue({
			ok: false,
			reason: "multi_org_customer",
			organizationName: null,
		});
		await render(CapacityCard, base);

		await page.getByRole("button", { name: "Add a block" }).click();
		await page.getByRole("button", { name: "Save changes" }).click();

		await vi.waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Extra capacity for your account is already billed in another organization. Remove those blocks there before adding them here.",
			),
		);
		expect(refreshAll).not.toHaveBeenCalled();
	});

	it("refuses changes while the billing interval is unknown", async () => {
		await render(CapacityCard, { ...base, annual: null });

		await expect
			.element(page.getByText(/billing period couldn't be confirmed/))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Save changes" }))
			.not.toBeInTheDocument();
	});
});
