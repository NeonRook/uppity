import { Resolver } from "node:dns/promises";

import { and, asc, eq, isNotNull, lt, or, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { DOMAIN_CHALLENGE_LABEL } from "../../status-page";
import { appUrl } from "../account-email";
import type { Db } from "../db/index";
import { statusPage, statusPageDomainClaim, type StatusPageDomainClaim } from "../db/schema";

/** Rechecks of one sweep, which run together while the worker's poll loop waits. */
const RECHECK_BATCH = 100;
const RECHECK_AFTER_MS = 60 * 60_000;
/** Hourly, so a domain that moves away keeps its page for about three hours. */
const MAX_FAILED_CHECKS = 3;

const UNIQUE_VIOLATION = "23505";

/** What DNS said. `unknown` is a resolver failure, which says nothing about the domain. */
export type DnsVerdict = "verified" | "missing" | "unknown";
export type DnsLookup = Pick<Resolver, "resolveCname" | "resolveTxt">;
export type VerifyResult = DnsVerdict | "taken";

const systemDns = (): DnsLookup => new Resolver({ timeout: 2000, tries: 1 });

/** The hostname customers point their CNAME at. Only the web tier reads this. */
export function domainTarget(): string {
	const target = process.env.UPPITY_STATUS_PAGE_CNAME_TARGET || new URL(appUrl).hostname;
	return canonical(target);
}

const canonical = (name: string) => name.toLowerCase().replace(/\.$/, "");

/** The records, or null when the resolver could not say. An absent record is an empty list. */
async function records<T>(lookup: Promise<T[]>): Promise<T[] | null> {
	try {
		return await lookup;
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException;
		return code === "ENODATA" || code === "ENOTFOUND" ? [] : null;
	}
}

/**
 * Looks up the two records and compares them, and nothing else touches the domain: no connection
 * is made to it, and no DNS answer or error reaches the customer. The CNAME sends traffic here.
 * The token, unique to this claim, proves the claimant controls the zone, since a CNAME left
 * behind by a previous owner would otherwise pass for anyone.
 */
export async function checkDns(
	{ domain, token, target }: { domain: string; token: string; target: string },
	dns: DnsLookup = systemDns(),
): Promise<DnsVerdict> {
	const [cnames, txts] = await Promise.all([
		records(dns.resolveCname(domain)),
		records(dns.resolveTxt(`${DOMAIN_CHALLENGE_LABEL}.${domain}`)),
	]);

	const routed = cnames?.some((name) => canonical(name) === target);
	const owned = txts?.some((chunks) => chunks.join("") === token);
	if (routed && owned) return "verified";
	return cnames === null || txts === null ? "unknown" : "missing";
}

export async function findClaim(db: Db, statusPageId: string) {
	const [claim] = await db
		.select()
		.from(statusPageDomainClaim)
		.where(eq(statusPageDomainClaim.statusPageId, statusPageId));
	return claim ?? null;
}

/** Whether a page other than this one serves the domain. */
async function heldElsewhere(db: Db, statusPageId: string, domain: string): Promise<boolean> {
	const [holder] = await db
		.select({ id: statusPage.id })
		.from(statusPage)
		.where(eq(statusPage.customDomain, domain));
	return holder !== undefined && holder.id !== statusPageId;
}

/**
 * Starts a claim with a new token and takes the page off any domain it held. Claims do not
 * reserve a domain: only verification does, so nobody can squat on a name they do not control.
 */
export async function claimDomain(
	db: Db,
	statusPageId: string,
	domain: string,
): Promise<StatusPageDomainClaim | null> {
	if (await heldElsewhere(db, statusPageId, domain)) return null;

	const claim = {
		domain,
		token: nanoid(32),
		verifiedTarget: null,
		failedChecks: 0,
		checkedAt: null,
	};
	return db.transaction(async (tx) => {
		await tx.update(statusPage).set({ customDomain: null }).where(eq(statusPage.id, statusPageId));
		const [row] = await tx
			.insert(statusPageDomainClaim)
			.values({ statusPageId, ...claim })
			.onConflictDoUpdate({ target: statusPageDomainClaim.statusPageId, set: claim })
			.returning();
		return row;
	});
}

export async function releaseDomain(db: Db, statusPageId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.update(statusPage).set({ customDomain: null }).where(eq(statusPage.id, statusPageId));
		await tx
			.delete(statusPageDomainClaim)
			.where(eq(statusPageDomainClaim.statusPageId, statusPageId));
	});
}

const isUniqueViolation = (error: unknown) =>
	(error as { cause?: { code?: string } }).cause?.code === UNIQUE_VIOLATION;

/**
 * Activates the claim if DNS proves it. The unique constraint on `status_page.custom_domain`
 * settles two organizations verifying at once. A failed check leaves a live domain in place:
 * only the sweep takes one down, after repeated answers.
 */
export async function verifyClaim(
	db: Db,
	claim: StatusPageDomainClaim,
	dns?: DnsLookup,
): Promise<VerifyResult> {
	const { statusPageId, domain, token } = claim;
	const target = domainTarget();
	const verdict = await checkDns({ domain, token, target }, dns);
	const ownClaim = and(
		eq(statusPageDomainClaim.statusPageId, statusPageId),
		eq(statusPageDomainClaim.token, token),
	);
	const checkedAt = new Date();

	if (verdict !== "verified") {
		await db.update(statusPageDomainClaim).set({ checkedAt }).where(ownClaim);
		return verdict;
	}
	if (await heldElsewhere(db, statusPageId, domain)) return "taken";

	try {
		await db.transaction(async (tx) => {
			const updated = await tx
				.update(statusPageDomainClaim)
				.set({ checkedAt, verifiedTarget: target, failedChecks: 0 })
				.where(ownClaim)
				.returning({ id: statusPageDomainClaim.statusPageId });
			if (updated.length === 0) return;
			await tx
				.update(statusPage)
				.set({ customDomain: domain })
				.where(eq(statusPage.id, statusPageId));
		});
	} catch (error) {
		if (isUniqueViolation(error)) return "taken";
		throw error;
	}
	return "verified";
}

async function recheck(db: Db, claim: StatusPageDomainClaim, target: string, dns?: DnsLookup) {
	const { statusPageId, domain, token } = claim;
	const verdict = await checkDns({ domain, token, target }, dns);
	const ownClaim = and(
		eq(statusPageDomainClaim.statusPageId, statusPageId),
		eq(statusPageDomainClaim.token, token),
	);
	const failedChecks = {
		verified: sql`0`,
		missing: sql`${statusPageDomainClaim.failedChecks} + 1`,
		unknown: statusPageDomainClaim.failedChecks,
	}[verdict];

	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(statusPageDomainClaim)
			.set({ checkedAt: new Date(), failedChecks })
			.where(ownClaim)
			.returning({ failedChecks: statusPageDomainClaim.failedChecks });
		if (!row || row.failedChecks < MAX_FAILED_CHECKS) return false;

		const lapsed = await tx
			.update(statusPage)
			.set({ customDomain: null })
			.where(and(eq(statusPage.id, statusPageId), eq(statusPage.customDomain, domain)))
			.returning({ id: statusPage.id });
		return lapsed.length > 0;
	});
}

/**
 * Rechecks live domains against the target each was verified on, so a page lets go of a domain
 * whose owner moved it away and a new owner can claim it. A resolver failure never counts: an
 * outage must not take a status page off its domain.
 */
export async function recheckDomains(db: Db, dns?: DnsLookup, now = new Date()) {
	const claims = await db
		.select({ claim: statusPageDomainClaim })
		.from(statusPageDomainClaim)
		.innerJoin(
			statusPage,
			and(
				eq(statusPage.id, statusPageDomainClaim.statusPageId),
				eq(statusPage.customDomain, statusPageDomainClaim.domain),
			),
		)
		.where(
			and(
				isNotNull(statusPageDomainClaim.verifiedTarget),
				or(
					isNull(statusPageDomainClaim.checkedAt),
					lt(statusPageDomainClaim.checkedAt, new Date(now.getTime() - RECHECK_AFTER_MS)),
				),
			),
		)
		.orderBy(asc(statusPageDomainClaim.checkedAt))
		.limit(RECHECK_BATCH);

	const lapsed = await Promise.all(
		claims.map(({ claim }) => recheck(db, claim, claim.verifiedTarget ?? "", dns)),
	);
	return { checked: claims.length, lapsed: lapsed.filter(Boolean).length };
}
