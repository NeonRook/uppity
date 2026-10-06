import { isHttpError } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";

import { handleAdminGate } from "./admin-gate";

function run(method: string, routeId: string, role: string | null) {
	const event = {
		request: new Request("http://localhost/admin", { method }),
		route: { id: routeId },
		locals: { user: role ? { role } : null },
	};
	return handleAdminGate({ event, resolve: async () => new Response("ok") } as never);
}

describe("handleAdminGate", () => {
	it("rejects a form action from a non-admin", async () => {
		const thrown = await Promise.resolve()
			.then(() => run("POST", "/(admin)/admin/organizations/[id]", "user"))
			.catch((err: unknown) => err);
		expect(isHttpError(thrown, 403)).toBe(true);
	});

	it("lets an admin through", async () => {
		const response = await run("POST", "/(admin)/admin/organizations/[id]", "admin");
		expect(response.status).toBe(200);
	});

	it("leaves page loads and other route groups to their own guards", async () => {
		expect((await run("GET", "/(admin)/admin/users", null)).status).toBe(200);
		expect((await run("POST", "/(app)/monitors/new", "user")).status).toBe(200);
	});
});
