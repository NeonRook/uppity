import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const entrypoint = fileURLToPath(new URL("entrypoint.sh", import.meta.url));

/** Runs the entrypoint in print mode and returns the node flags it assembled. */
async function commandFor(
	target: string,
	env: Record<string, string> = {},
): Promise<{ flags: string[]; read: string[]; entry: string }> {
	const { stdout } = await run(entrypoint, [target], {
		env: { PATH: process.env.PATH ?? "", UPPITY_PRINT_PERMISSIONS: "1", ...env },
	});
	const args = stdout.trim().split(" ").slice(1);
	const flags = args.slice(0, -1);
	return {
		flags,
		read: flags.filter((f) => f.startsWith("--allow-fs-read=")).map((f) => f.split("=")[1]),
		entry: args[args.length - 1],
	};
}

const DB = "postgres://uppity:secret@db.internal:5432/uppity";

describe("permission model", () => {
	const targets = ["serve", "migrate", "worker-monitor", "worker-notifier"];

	it.each(targets)("%s runs under --permission", async (target) => {
		const { flags } = await commandFor(target, { DATABASE_URL: DB });
		expect(flags).toContain("--permission");
	});

	it.each(targets)("%s is granted nothing beyond reads and the network", async (target) => {
		const { flags } = await commandFor(target, { DATABASE_URL: DB });
		const grants = flags.filter((f) => f.startsWith("--allow-"));
		expect(grants.every((f) => f === "--allow-net" || f.startsWith("--allow-fs-read="))).toBe(true);
	});

	it("scopes the web tier's reads to the build", async () => {
		const { read, entry } = await commandFor("serve", { DATABASE_URL: DB });
		expect(read).toEqual(["./build"]);
		expect(entry).toBe("./build/serve.js");
	});

	it("scopes migrate's reads to the migration SQL and the build", async () => {
		const { read, entry } = await commandFor("migrate", { DATABASE_URL: DB });
		expect(read).toEqual(["./drizzle", "./build"]);
		expect(entry).toBe("./build/migrate.js");
	});

	it.each(["worker-monitor", "worker-notifier"])(
		"scopes %s's reads to the build",
		async (target) => {
			const { read, entry } = await commandFor(target, { DATABASE_URL: DB });
			expect(read).toEqual(["./build"]);
			expect(entry).toBe(`./build/${target}.js`);
		},
	);
});

describe("preconditions", () => {
	it("refuses an unknown target", async () => {
		await expect(commandFor("bogus", { DATABASE_URL: DB })).rejects.toMatchObject({ code: 64 });
	});

	it("refuses to start without DATABASE_URL", async () => {
		await expect(commandFor("serve")).rejects.toMatchObject({ code: 78 });
	});
});
