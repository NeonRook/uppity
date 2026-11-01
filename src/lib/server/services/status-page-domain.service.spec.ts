import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeDomain } from "../../status-page";
import { appUrl } from "../account-email";
import { member, user } from "../db/auth-schema";
import type { Db } from "../db/index";
import { auditLog, statusPage, statusPageDomainClaim } from "../db/schema";
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
const target = "domains.uppity.cloud";

const noNotice = vi.fn(async () => {});

beforeAll(() => {
	vi.stubEnv("UPPITY_STATUS_PAGE_CNAME_TARGET", target);
});
afterAll(() => {
	vi.unstubAllEnvs();
});

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

const oneMissFromLapsing = (db: Db, id: string) =>
	db
		.update(statusPageDomainClaim)
		.set({ failedChecks: 2 })
		.where(eq(statusPageDomainClaim.statusPageId, id));

async function seedMember(db: Db, organizationId: string, role: string): Promise<string> {
	const id = nanoid();
	const email = `${id}@example.org`.toLowerCase();
	await db.insert(user).values({
		id,
		name: id,
		email,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	await db.insert(member).values({ id, organizationId, userId: id, role, createdAt: new Date() });
	return email;
}

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

	it("ignores a CNAME aimed at an internal name, and follows no answer", async () => {
		const dns = dnsWith({ cname: "metadata.google.internal", token: claim.token });

		await expect(checkDns(claim, dns)).resolves.toBe("missing");
		expect(dns.resolveCname).toHaveBeenCalledOnce();
		expect(dns.resolveTxt).toHaveBeenCalledOnce();
	});

	it.each(["10.0.0.1", "http://10.0.0.1/x", "foo.internal", "localhost"])(
		"looks up nothing for %s, a value stored before validation",
		async (domain) => {
			const dns = dnsWith({ cname: claim.target, token: claim.token });

			await expect(checkDns({ ...claim, domain }, dns)).resolves.toBe("missing");
			expect(dns.resolveCname).not.toHaveBeenCalled();
		},
	);

	it.each(["ENOTFOUND", "ENODATA"])("reads %s as the records being gone", async (code) => {
		await expect(checkDns(claim, failingDns(code))).resolves.toBe("missing");
	});

	it.each(["ETIMEOUT", "ESERVFAIL", "ECONNREFUSED"])("reads %s as no answer", async (code) => {
		await expect(checkDns(claim, failingDns(code))).resolves.toBe("unknown");
	});
});

describe("domainTarget", () => {
	beforeEach(() => {
		vi.stubEnv("SELF_HOSTED", "");
	});
	afterAll(() => {
		vi.stubEnv("SELF_HOSTED", "");
		vi.stubEnv("UPPITY_STATUS_PAGE_CNAME_TARGET", target);
	});

	it("takes the operator's target in canonical form", () => {
		vi.stubEnv("UPPITY_STATUS_PAGE_CNAME_TARGET", "Domains.Uppity.cloud.");

		expect(domainTarget()).toBe("domains.uppity.cloud");
	});

	it("is unset on the hosted service until the operator names one", () => {
		vi.stubEnv("UPPITY_STATUS_PAGE_CNAME_TARGET", "");

		expect(domainTarget()).toBeNull();
	});

	it("falls back to the app's host when self-hosted, if that is a public name", () => {
		vi.stubEnv("UPPITY_STATUS_PAGE_CNAME_TARGET", "");
		vi.stubEnv("SELF_HOSTED", "true");

		expect(domainTarget()).toBe(normalizeDomain(new URL(appUrl).hostname));
	});

	it.each(["10.0.0.1", "localhost", "uppity.internal"])("refuses %s as a target", (value) => {
		vi.stubEnv("UPPITY_STATUS_PAGE_CNAME_TARGET", value);

		expect(domainTarget()).toBeNull();
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

	test("report no verification when a newer claim replaced them", async ({ db: { db } }) => {
		const id = await seedPage(db);
		const stale = (await claimDomain(db, id, DOMAIN))!;
		await claimDomain(db, id, DOMAIN);

		await expect(verifyClaim(db, stale, dnsWith({ token: stale.token }))).resolves.toBe("unknown");
	});

	test("cannot use another page's token on a domain it holds", async ({ db: { db } }) => {
		const { claim: held } = await verifiedPage(db);
		const other = await seedPage(db);

		await expect(claimDomain(db, other, DOMAIN)).resolves.toBeNull();
		await expect(
			verifyClaim(db, { ...held, statusPageId: other }, dnsWith({ token: held.token })),
		).resolves.toBe("taken");
		expect(await pageDomain(db, other)).toBeNull();
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
			await expect(recheckDomains(db, noNotice, moved)).resolves.toMatchObject({
				checked: 1,
				lapsed,
			});
			await staleClaim(db, id);
		}

		expect(await pageDomain(db, id)).toBeNull();
	});

	test("records a lapse for the operator, the card and the owners", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);
		await oneMissFromLapsing(db, id);
		const [page] = await db.select().from(statusPage).where(eq(statusPage.id, id));
		const manager = await seedMember(db, page.organizationId, "owner");
		await seedMember(db, page.organizationId, "member");
		const sendNotice = vi.fn(async () => {});

		await recheckDomains(db, sendNotice, dnsWith({}));

		expect(sendNotice).toHaveBeenCalledExactlyOnceWith(
			[manager],
			expect.objectContaining({ domain: DOMAIN, page: expect.objectContaining({ id }) }),
		);
		const [claim] = await db
			.select()
			.from(statusPageDomainClaim)
			.where(eq(statusPageDomainClaim.statusPageId, id));
		expect(claim.lapsedAt).toBeInstanceOf(Date);
		const rows = await db.select().from(auditLog).where(eq(auditLog.targetId, id));
		expect(rows).toEqual([
			expect.objectContaining({
				action: "status_page.domain_lapse",
				actorId: null,
				actorEmail: "system",
				targetLabel: DOMAIN,
			}),
		]);
	});

	test("keeps a lapse when its notice cannot be sent", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);
		await oneMissFromLapsing(db, id);
		const unreachable = vi.fn(async () => {
			throw new Error("SMTP not configured");
		});

		await expect(recheckDomains(db, unreachable, dnsWith({}))).resolves.toEqual({
			checked: 1,
			lapsed: 1,
			unnotified: 1,
		});
		expect(await pageDomain(db, id)).toBeNull();
	});

	test("clears the lapse when the owner verifies again", async ({ db: { db } }) => {
		const { id, claim } = await verifiedPage(db);
		await oneMissFromLapsing(db, id);
		await recheckDomains(db, noNotice, dnsWith({}));

		await verifyClaim(db, claim, dnsWith({ token: claim.token }));

		const [row] = await db
			.select()
			.from(statusPageDomainClaim)
			.where(eq(statusPageDomainClaim.statusPageId, id));
		expect(row).toMatchObject({ lapsedAt: null, failedChecks: 0 });
		expect(await pageDomain(db, id)).toBe(DOMAIN);
	});

	test("does not let a lapsed page take the domain from its new owner", async ({ db: { db } }) => {
		const { id, claim: lapsed } = await verifiedPage(db);
		await oneMissFromLapsing(db, id);
		await recheckDomains(db, noNotice, dnsWith({}));
		const owner = await seedPage(db);
		const claim = (await claimDomain(db, owner, DOMAIN))!;
		await verifyClaim(db, claim, dnsWith({ token: claim.token }));

		await expect(verifyClaim(db, lapsed, dnsWith({ token: lapsed.token }))).resolves.toBe("taken");
		expect(await pageDomain(db, owner)).toBe(DOMAIN);
	});

	test("counts one miss when two sweeps overlap", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);

		await Promise.all([
			recheckDomains(db, noNotice, dnsWith({})),
			recheckDomains(db, noNotice, dnsWith({})),
		]);

		const [row] = await db
			.select({ failedChecks: statusPageDomainClaim.failedChecks })
			.from(statusPageDomainClaim)
			.where(eq(statusPageDomainClaim.statusPageId, id));
		expect(row.failedChecks).toBe(1);
	});

	test("frees the domain for a new owner once it lapses", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);
		await oneMissFromLapsing(db, id);
		await recheckDomains(db, noNotice, dnsWith({}));

		const owner = await seedPage(db);
		const claim = (await claimDomain(db, owner, DOMAIN))!;

		await expect(verifyClaim(db, claim, dnsWith({ token: claim.token }))).resolves.toBe("verified");
	});

	test("keeps the domain through a resolver outage", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);

		for (let run = 0; run < 5; run++) {
			await recheckDomains(db, noNotice, failingDns("ETIMEOUT"));
			await staleClaim(db, id);
		}

		expect(await pageDomain(db, id)).toBe(DOMAIN);
	});

	test("forgets failures once the records are back", async ({ db: { db } }) => {
		const { id, claim } = await verifiedPage(db);
		await recheckDomains(db, noNotice, dnsWith({}));
		await staleClaim(db, id);
		await recheckDomains(db, noNotice, dnsWith({ token: claim.token }));

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

		await recheckDomains(db, noNotice, dnsWith({ cname: "edge.uppity.cloud", token: claim.token }));

		expect(await pageDomain(db, id)).toBe(DOMAIN);
	});

	test("leaves recent checks and pending claims alone", async ({ db: { db } }) => {
		const { id } = await verifiedPage(db);
		await db
			.update(statusPageDomainClaim)
			.set({ checkedAt: sql`now()` })
			.where(eq(statusPageDomainClaim.statusPageId, id));
		await claimDomain(db, await seedPage(db), "status.pending.com");

		await expect(recheckDomains(db, noNotice, dnsWith({}))).resolves.toMatchObject({
			checked: 0,
			lapsed: 0,
		});
	});
});
