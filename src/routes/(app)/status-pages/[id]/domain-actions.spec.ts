import { beforeEach, describe, expect, it, vi } from "vitest";

import { actions } from "./+page.server";

const { canManage, claimDomain, verifyDomain, releaseDomain } = vi.hoisted(() => ({
	canManage: vi.fn(),
	claimDomain: vi.fn(),
	verifyDomain: vi.fn(),
	releaseDomain: vi.fn(),
}));

vi.mock("#lib/server/organization-role.js", () => ({ canManage }));
vi.mock("#lib/server/services/status-page.service.js", () => ({
	statusPageService: { claimDomain, verifyDomain, releaseDomain },
}));

function post(action: "claimDomain" | "verifyDomain" | "releaseDomain", id = "page") {
	const url = `http://localhost/status-pages/${id}?/${action}`;
	const event = {
		params: { id },
		url: new URL(url),
		request: new Request(url, {
			method: "POST",
			body: new URLSearchParams({ domain: "status.acme.com" }),
		}),
		locals: {
			user: { id: "user" },
			session: { activeOrganizationId: "org" },
			event: { merge: vi.fn() },
		},
	};
	return actions[action](event as never) as Promise<{
		status?: number;
		data?: { domainNotice: { ok: boolean } };
		domainNotice?: { ok: boolean };
	}>;
}

beforeEach(() => {
	canManage.mockReset();
	claimDomain.mockReset();
	verifyDomain.mockReset();
	releaseDomain.mockReset();
});

describe("custom domain actions", () => {
	it.each(["claimDomain", "verifyDomain", "releaseDomain"] as const)(
		"refuses %s from a plain member and changes nothing",
		async (action) => {
			canManage.mockResolvedValue(false);

			await expect(post(action)).resolves.toMatchObject({ status: 403 });

			expect(canManage).toHaveBeenCalledWith("org", "user");
			expect(claimDomain).not.toHaveBeenCalled();
			expect(verifyDomain).not.toHaveBeenCalled();
			expect(releaseDomain).not.toHaveBeenCalled();
		},
	);

	it("lets an owner or admin through", async () => {
		canManage.mockResolvedValue(true);
		verifyDomain.mockResolvedValue("verified");
		releaseDomain.mockResolvedValue(true);

		await expect(post("verifyDomain", "own-page")).resolves.toMatchObject({
			domainNotice: { ok: true },
		});
		await expect(post("releaseDomain", "own-page")).resolves.toMatchObject({
			domainNotice: { ok: true },
		});
	});

	it("reports a page outside the organization on release", async () => {
		canManage.mockResolvedValue(true);
		releaseDomain.mockResolvedValue(false);

		await expect(post("releaseDomain", "foreign-page")).resolves.toMatchObject({ status: 404 });
	});
});
