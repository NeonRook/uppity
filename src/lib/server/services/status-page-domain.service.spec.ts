import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";

import { appUrl } from "../account-email";
import type { Db } from "../db/index";
import { statusPage, statusPageDomainClaim } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedOrg } from "../test/seed";
import {
	checkDns,
	claimDomain,
	domainTarget,
	recheckDomains,
	releaseDomain,
	verifyClaim,
	type DnsLookup,
} from "./status-page-domain.service";

const DOMAIN = "status.acme.com";
const target = new URL(appUrl).hostname;

const dnsError = (code: string) => Object.assign(new Error(code), { code });

/** DNS with the given records. The token defaults to nothing, as for a dangling CNAME. */
function dnsWith({ cname = target, token }: { cname?: string; token?: string }): DnsLookup {
	return {
		resolveCname: vi.fn(async () => [cname]),
		resolveTxt: vi.fn(async () => (token ? [[token.slice(0, 5), token.slice(5)]] : [])),
	};
}

function failingDns(code: string): DnsLookup {
	const fail = vi.fn(async () => {
		throw dnsError(code);
	});
	return { resolveCname: fail, resolveTxt: fail };
}

async function seedPage(db: Db): Promise<string> {
	const id = `sp-${nanoid()}`;
	await db.insert(statusPage).values({
		id,
		organizationId: await seedOrg(db),
		name: "Public",
		slug: id.toLowerCase(),
	});
	return id;
}

async function pageDomain(db: Db, id: string) {
	const [page] = await db.select().from(statusPage).where(eq(statusPage.id, id));
	return page.customDomain;
}

async function verifiedPage(db: Db, domain = DOMAIN) {
	const id = await seedPage(db);
	const claim = (await claimDomain(db, id, domain))!;
	await expect(verifyClaim(db, claim, dnsWith({ token: claim.token }))).resolves.toBe("verified");
	// As if the last check were long ago, so the sweep picks it up.
	await staleClaim(db, id);
	return { id, claim };
}

const staleClaim = (db: Db, id: string) =>
	db
		.update(statusPageDomainClaim)
		.set({ checkedAt: new Date(0) })
		.where(eq(statusPageDomainClaim.statusPageId, id));

/** The database lasts the whole file, and these tests all want the one domain. */
async function clearDomains({ db: { db } }: { db: TestDb }) {
	await db.delete(statusPageDomainClaim);
	await db.update(statusPage).set({ customDomain: null });
}

describe("checkDns", () => {
	const claim = { domain: DOMAIN, token: "token-value", target: "uppity.example.com" };

	it("needs both the CNAME and the claim's token", async () => {
		const { token } = claim;
		const check = (dns: DnsLookup) => checkDns(claim, dns);

		await expect(check(dnsWith({ cname: claim.target, token }))).resolves.toBe("verified");
		await expect(check(dnsWith({ cname: claim.target }))).resolves.toBe("missing");
		await expect(check(dnsWith({ cname: "elsewhere.com", token }))).resolves.toBe("missing");
		await expect(check(dnsWith({ cname: claim.target, token: "other-token" }))).resolves.toBe(
			"missing",
		);
	});

	it("ignores case and the trailing dot in the answer", async () => {
		const dns = dnsWith({ cname: "UPPITY.Example.com.", token: claim.token });

		await expect(checkDns(claim, dns)).resolves.toBe("verified");
	});

	it("looks up the domain and its challenge label, and nothing else", async () => {
		const dns = dnsWith({ cname: claim.target, token: claim.token });

		await checkDns(claim, dns);

		expect(dns.resolveCname).toHaveBeenCalledExactlyOnceWith(DOMAIN);
		expect(dns.resolveTxt).toHaveBeenCalledExactlyOnceWith(`_uppity-challenge.${DOMAIN}`);
	});

	it.each(["ENOTFOUND", "ENODATA"])("reads %s as the records being gone", async (code) => {
		await expect(checkDns(claim, failingDns(code))).resolves.toBe("missing");
	});

	it.each(["ETIMEOUT", "ESERVFAIL", "ECONNREFUSED"])("reads %s as no answer", async (code) => {
		await expect(checkDns(claim, failingDns(code))).resolves.toBe("unknown");
	});
});

describe("domainTarget", () => {
	it("is the app's host unless the operator names another, in canonical form", () => {
		expect(domainTarget()).toBe(target);

		vi.stubEnv("UPPITY_STATUS_PAGE_CNAME_TARGET", "Domains.Uppity.cloud.");
		expect(domainTarget()).toBe("domains.uppity.cloud");
		vi.unstubAllEnvs();
	});
});

describe("claims", () => {
	test.beforeEach(clearDomains);

	test("activate only once verified", async ({ db: { db } }) => {
		const id = await seedPage(db);
		const claim = (await claimDomain(db, id, DOMAIN))!;

		expect(await pageDomain(db, id)).toBeNull();
		await expect(verifyClaim(db, claim, dnsWith({}))).resolves.toBe("missing");
		expect(await pageDomain(db, id)).toBeNull();

		await verifyClaim(db, claim, dnsWith({ token: claim.token }));
		expect(await pageDomain(db, id)).toBe(DOMAIN);
	});

	test("do not hold a domain, so a squatter cannot block its owner", async ({ db: { db } }) => {
		const squatter = await seedPage(db);
		await claimDomain(db, squatter, DOMAIN);

		const owner = await seedPage(db);
		const claim = (await claimDomain(db, owner, DOMAIN))!;
		await expect(verifyClaim(db, claim, dnsWith({ token: claim.token }))).resolves.toBe("verified");
	});

	test("get a token of their own, so a dangling CNAME proves nothing", async ({ db: { db } }) => {
		const { id: previous, claim: old } = await verifiedPage(db);
		await releaseDomain(db, previous);

		const attacker = await seedPage(db);
		const claim = (await claimDomain(db, attacker, DOMAIN))!;

		expect(claim.token).not.toBe(old.token);
		// The previous owner's CNAME and TXT records are both still in the zone.
		await expect(verifyClaim(db, claim, dnsWith({ token: old.token }))).resolves.toBe("missing");
		expect(await pageDomain(db, attacker)).toBeNull();
	});

	test("cannot start on a domain another page has verified", async ({ db: { db } }) => {
		await verifiedPage(db);

		await expect(claimDomain(db, await seedPage(db), DOMAIN)).resolves.toBeNull();
	});

	test("lose a race to verify at the database", async ({ db: { db } }) => {
		const [first, second] = [await seedPage(db), await seedPage(db)];
		const a = (await claimDomain(db, first, DOMAIN))!;
		const b = (await claimDomain(db, second, DOMAIN))!;

		const results = await Promise.all([
			verifyClaim(db, a, dnsWith({ token: a.token })),
			verifyClaim(db, b, dnsWith({ token: b.token })),
		]);

		expect(results.toSorted()).toEqual(["taken", "verified"]);
	});

	test("that were replaced cannot activate", async ({ db: { db } }) => {
		const id = await seedPage(db);
		const stale = (await claimDomain(db, id, DOMAIN))!;
		await claimDomain(db, id, "status.other.com");

		await verifyClaim(db, stale, dnsWith({ token: stale.token }));

		expect(await pageDomain(db, id)).toBeNull();
	});

	test("end with the page's domain when released", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);

		await releaseDomain(db, id);

		expect(await pageDomain(db, id)).toBeNull();
	});
});

describe("the database", () => {
	test.beforeEach(clearDomains);

	test("refuses two pages on one domain", async ({ db: { db } }) => {
		await verifiedPage(db);
		const id = await seedPage(db);

		await expect(
			db.update(statusPage).set({ customDomain: DOMAIN }).where(eq(statusPage.id, id)),
		).rejects.toThrow(/Failed query/);
	});

	test("refuses case and trailing-dot variants", async ({ db: { db } }) => {
		const id = await seedPage(db);

		for (const variant of ["Status.Acme.com", "status.acme.com."]) {
			await expect(
				db.update(statusPage).set({ customDomain: variant }).where(eq(statusPage.id, id)),
			).rejects.toThrow(/Failed query/);
			await expect(
				db.insert(statusPageDomainClaim).values({ statusPageId: id, domain: variant, token: "t" }),
			).rejects.toThrow(/Failed query/);
		}
	});
});

describe("recheckDomains", () => {
	test.beforeEach(clearDomains);

	test("lets go of a domain after three answers that the records are gone", async ({
		db: { db },
	}) => {
		const { id } = await verifiedPage(db);
		const moved = dnsWith({ cname: "elsewhere.com" });

		for (const lapsed of [0, 0, 1]) {
			await expect(recheckDomains(db, moved)).resolves.toEqual({ checked: 1, lapsed });
			await staleClaim(db, id);
		}

		expect(await pageDomain(db, id)).toBeNull();
	});

	test("frees the domain for a new owner once it lapses", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);
		await db
			.update(statusPageDomainClaim)
			.set({ failedChecks: 2 })
			.where(eq(statusPageDomainClaim.statusPageId, id));
		await recheckDomains(db, dnsWith({}));

		const owner = await seedPage(db);
		const claim = (await claimDomain(db, owner, DOMAIN))!;

		await expect(verifyClaim(db, claim, dnsWith({ token: claim.token }))).resolves.toBe("verified");
	});

	test("keeps the domain through a resolver outage", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);

		for (let run = 0; run < 5; run++) {
			await recheckDomains(db, failingDns("ETIMEOUT"));
			await staleClaim(db, id);
		}

		expect(await pageDomain(db, id)).toBe(DOMAIN);
	});

	test("forgets failures once the records are back", async ({ db: { db } }) => {
		const { id, claim } = await verifiedPage(db);
		await recheckDomains(db, dnsWith({}));
		await staleClaim(db, id);
		await recheckDomains(db, dnsWith({ token: claim.token }));

		const [row] = await db
			.select({ failedChecks: statusPageDomainClaim.failedChecks })
			.from(statusPageDomainClaim)
			.where(eq(statusPageDomainClaim.statusPageId, id));
		expect(row.failedChecks).toBe(0);
	});

	test("compares against the target the domain was verified on", async ({ db: { db } }) => {
		const { id, claim } = await verifiedPage(db);
		await db
			.update(statusPageDomainClaim)
			.set({ verifiedTarget: "edge.uppity.cloud", failedChecks: 2 })
			.where(eq(statusPageDomainClaim.statusPageId, id));

		await recheckDomains(db, dnsWith({ cname: "edge.uppity.cloud", token: claim.token }));

		expect(await pageDomain(db, id)).toBe(DOMAIN);
	});

	test("leaves recent checks and pending claims alone", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);
		await db
			.update(statusPageDomainClaim)
			.set({ checkedAt: sql`now()` })
			.where(eq(statusPageDomainClaim.statusPageId, id));
		await claimDomain(db, await seedPage(db), "status.pending.com");

		await expect(recheckDomains(db, dnsWith({}))).resolves.toEqual({ checked: 0, lapsed: 0 });
	});
});
