import { isHttpError, isRedirect } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";

import { handleAdminGate } from "./admin-gate";

function run(method: string, routeId: string, role: string | null) {
	const event = {
		request: new Request("http://localhost/admin", { method }),
		route: { id: routeId },
		locals: { user: role ? { role } : null },
	};
	return Promise.resolve()
		.then(() => handleAdminGate({ event, resolve: async () => new Response("ok") } as never))
		.catch((err: unknown) => err);
}

describe("handleAdminGate", () => {
	it("rejects a form action from a non-admin", async () => {
		expect(isHttpError(await run("POST", "/(admin)/admin/organizations/[id]", "user"), 403)).toBe(
			true,
		);
	});

	it("redirects a non-admin page or data request before any load runs", async () => {
		expect(isRedirect(await run("GET", "/(admin)/admin/users", "user"))).toBe(true);
		expect(isRedirect(await run("GET", "/(admin)/admin/users", null))).toBe(true);
	});

	it("lets an admin through", async () => {
		expect(
			((await run("POST", "/(admin)/admin/organizations/[id]", "admin")) as Response).status,
		).toBe(200);
		expect(((await run("GET", "/(admin)/admin/users", "admin")) as Response).status).toBe(200);
	});

	it("leaves the login page and other route groups alone", async () => {
		expect(((await run("GET", "/(admin)/admin/login", null)) as Response).status).toBe(200);
		expect(((await run("POST", "/(app)/monitors/new", "user")) as Response).status).toBe(200);
	});
});
