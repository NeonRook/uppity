import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const entrypoint = fileURLToPath(new URL("entrypoint.sh", import.meta.url));

/** Runs the entrypoint in print mode and returns the deno flags it assembled. */
async function permissionsFor(
	target: string,
	env: Record<string, string> = {},
): Promise<{ net: string[]; read: string[]; flags: string[]; entry: string }> {
	const { stdout } = await run(entrypoint, [target], {
		env: { PATH: process.env.PATH ?? "", UPPITY_PRINT_PERMISSIONS: "1", ...env },
	});
	const flags = stdout.trim().split(" ").slice(2);
	const valueOf = (name: string) =>
		flags.find((f) => f.startsWith(`--allow-${name}=`))?.split("=")[1];
	return {
		net: valueOf("net")?.split(",") ?? [],
		read: valueOf("read")?.split(",") ?? [],
		flags,
		entry: flags[flags.length - 1],
	};
}

const DB = "postgres://uppity:secret@db.internal:5432/uppity";

describe("network allowlist", () => {
	it("takes host and port from DATABASE_URL", async () => {
		const { net } = await permissionsFor("serve", { DATABASE_URL: DB });
		expect(net).toContain("db.internal:5432");
	});

	it("keeps the host when the URL carries a query string", async () => {
		const { net } = await permissionsFor("serve", { DATABASE_URL: `${DB}?sslmode=require` });
		expect(net).toContain("db.internal:5432");
	});

	it("keeps the host when a percent-encoded password contains an at sign", async () => {
		const { net } = await permissionsFor("serve", {
			DATABASE_URL: "postgres://uppity:p%40ss@db.internal:5432/uppity",
		});
		expect(net).toContain("db.internal:5432");
	});

	it("allows every port when the URL names none", async () => {
		const { net } = await permissionsFor("serve", {
			DATABASE_URL: "postgres://db.internal/uppity",
		});
		expect(net).toContain("db.internal");
	});

	it("includes the listening socket", async () => {
		const { net } = await permissionsFor("serve", {
			DATABASE_URL: DB,
			HOST: "127.0.0.1",
			PORT: "8080",
		});
		expect(net).toContain("127.0.0.1:8080");
	});

	it("includes the SMTP host once configured", async () => {
		const { net } = await permissionsFor("serve", {
			DATABASE_URL: DB,
			SMTP_HOST: "smtp.example.com",
			SMTP_PORT: "587",
		});
		expect(net).toContain("smtp.example.com:587");
	});

	it("leaves Polar off the list when no access token is set", async () => {
		const { net } = await permissionsFor("serve", { DATABASE_URL: DB });
		expect(net.some((host) => host.includes("polar.sh"))).toBe(false);
	});

	it("picks the sandbox Polar host when asked for it", async () => {
		const { net } = await permissionsFor("serve", {
			DATABASE_URL: DB,
			POLAR_ACCESS_TOKEN: "token",
			POLAR_SERVER: "sandbox",
		});
		expect(net).toContain("sandbox-api.polar.sh:443");
	});

	it("defaults Polar to production", async () => {
		const { net } = await permissionsFor("serve", {
			DATABASE_URL: DB,
			POLAR_ACCESS_TOKEN: "token",
		});
		expect(net).toContain("api.polar.sh:443");
	});

	it("gives migrate the database and nothing else", async () => {
		const { net } = await permissionsFor("migrate", {
			DATABASE_URL: DB,
			SMTP_HOST: "smtp.example.com",
		});
		expect(net).toEqual(["db.internal:5432"]);
	});
});

describe("permission sets", () => {
	it.each(["serve", "migrate", "worker-monitor", "worker-notifier"])(
		"%s runs without write, run or ffi",
		async (target) => {
			const { flags } = await permissionsFor(target, { DATABASE_URL: DB });
			expect(flags.filter((f) => /^--allow-(write|run|ffi|import)/.test(f))).toEqual([]);
		},
	);

	it.each(["serve", "migrate", "worker-monitor", "worker-notifier"])(
		"%s narrows sys access to the hostname the logger reads",
		async (target) => {
			const { flags } = await permissionsFor(target, { DATABASE_URL: DB });
			expect(flags).toContain("--allow-sys=hostname");
		},
	);

	it("scopes the web tier's reads to the served trees", async () => {
		const { read } = await permissionsFor("serve", { DATABASE_URL: DB });
		expect(read).toEqual(["./.deno-deploy", "./build"]);
	});

	it("scopes migrate's reads to the migration SQL", async () => {
		const { read } = await permissionsFor("migrate", { DATABASE_URL: DB });
		expect(read).toEqual(["./drizzle", "./build"]);
	});

	it.each(["worker-monitor", "worker-notifier"])(
		"%s keeps unrestricted network access, which it needs by design",
		async (target) => {
			const { flags } = await permissionsFor(target, { DATABASE_URL: DB });
			expect(flags).toContain("--allow-net");
		},
	);
});

describe("preconditions", () => {
	it("refuses an unknown target", async () => {
		await expect(permissionsFor("bogus", { DATABASE_URL: DB })).rejects.toMatchObject({ code: 64 });
	});

	it("refuses to start without DATABASE_URL", async () => {
		await expect(permissionsFor("serve")).rejects.toMatchObject({ code: 78 });
	});
});
