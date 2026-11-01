import { Resolver } from "node:dns/promises";

import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { AuditAction, AuditTargetType } from "../../constants/audit";
import { isSelfHosted } from "../../constants/plans";
import { DOMAIN_CHALLENGE_LABEL, normalizeDomain } from "../../status-page";
import { appUrl, type DomainLapseNotice } from "../account-email";
import { member, user } from "../db/auth-schema";
import type { Db } from "../db/index";
import {
	auditLog,
	statusPage,
	statusPageDomainClaim,
	type StatusPageDomainClaim,
} from "../db/schema";

/** Rechecks of one sweep, one at a time, so a sweep holds one database connection at most. */
const RECHECK_BATCH = 100;
const RECHECK_AFTER_MS = 60 * 60_000;
/** Hourly, so a domain that moves away keeps its page for about three hours. */
const MAX_FAILED_CHECKS = 3;

/** Members told about a lapse: the roles that can act on it. */
const NOTICE_ROLES = ["owner", "admin"];

const UNIQUE_VIOLATION = "23505";

/** What DNS said. `unknown` is a resolver failure, which says nothing about the domain. */
export type DnsVerdict = "verified" | "missing" | "unknown";
export type DnsLookup = Pick<Resolver, "resolveCname" | "resolveTxt">;
export type VerifyResult = DnsVerdict | "taken";

const systemDns = (): DnsLookup => new Resolver({ timeout: 2000, tries: 1 });

/**
 * The hostname customers point their CNAME at, or null when this instance has none and so cannot
 * offer custom domains. The hosted service has no default, because the host of `BETTER_AUTH_URL`
 * is not where its proxy accepts a customer's domain. Only the web tier reads this.
 */
export function domainTarget(): string | null {
	const target = process.env.UPPITY_STATUS_PAGE_CNAME_TARGET;
	return normalizeDomain(target || (isSelfHosted() ? new URL(appUrl).hostname : ""));
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
	// A value stored before domains were validated may be an address or an internal name.
	if (normalizeDomain(domain) !== domain) return "missing";

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
		lapsedAt: null,
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
	if (!target) return "unknown";

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
		return await db.transaction(async (tx) => {
			const updated = await tx
				.update(statusPageDomainClaim)
				.set({ checkedAt, verifiedTarget: target, failedChecks: 0, lapsedAt: null })
				.where(ownClaim)
				.returning({ id: statusPageDomainClaim.statusPageId });
			// A newer claim on the page replaced this one while DNS answered.
			if (updated.length === 0) return "unknown";
			await tx
				.update(statusPage)
				.set({ customDomain: domain })
				.where(eq(statusPage.id, statusPageId));
			return "verified";
		});
	} catch (error) {
		if (isUniqueViolation(error)) return "taken";
		throw error;
	}
}

/** A check due at `now`. Tested again in the write, so two sweeps at once count one miss. */
const recheckDue = (now: Date) =>
	or(
		isNull(statusPageDomainClaim.checkedAt),
		lt(statusPageDomainClaim.checkedAt, new Date(now.getTime() - RECHECK_AFTER_MS)),
	);

async function recheck(
	db: Db,
	claim: StatusPageDomainClaim,
	target: string,
	now: Date,
	dns?: DnsLookup,
) {
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
			.where(and(ownClaim, recheckDue(now)))
			.returning({ failedChecks: statusPageDomainClaim.failedChecks });
		if (!row || row.failedChecks < MAX_FAILED_CHECKS) return null;

		const [page] = await tx
			.update(statusPage)
			.set({ customDomain: null })
			.where(and(eq(statusPage.id, statusPageId), eq(statusPage.customDomain, domain)))
			.returning({
				id: statusPage.id,
				name: statusPage.name,
				organizationId: statusPage.organizationId,
			});
		if (!page) return null;

		await tx.update(statusPageDomainClaim).set({ lapsedAt: new Date() }).where(ownClaim);
		await tx.insert(auditLog).values({
			id: nanoid(),
			actorEmail: "system",
			action: "status_page.domain_lapse" satisfies AuditAction,
			targetType: "status_page" satisfies AuditTargetType,
			targetId: page.id,
			targetLabel: domain,
			metadata: { organizationId: page.organizationId },
		});
		return page;
	});
}

async function ownersAndAdmins(db: Db, organizationId: string): Promise<string[]> {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, organizationId), inArray(member.role, NOTICE_ROLES)));
	return rows.map((row) => row.email);
}

/** Delivers a lapse notice or throws. */
export type SendDomainLapseNotice = (to: string[], notice: DomainLapseNotice) => Promise<void>;

/**
 * Rechecks live domains against the target each was verified on, so a page lets go of a domain
 * whose owner moved it away and a new owner can claim it. A resolver failure never counts: an
 * outage must not take a status page off its domain. A notice that cannot be sent is only
 * counted, because the audit log and the settings card already record the lapse.
 */
export async function recheckDomains(
	db: Db,
	sendNotice: SendDomainLapseNotice,
	dns?: DnsLookup,
	now = new Date(),
) {
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
		.where(and(isNotNull(statusPageDomainClaim.verifiedTarget), recheckDue(now)))
		.orderBy(asc(statusPageDomainClaim.checkedAt))
		.limit(RECHECK_BATCH);

	const result = { checked: claims.length, lapsed: 0, unnotified: 0 };
	for (const { claim } of claims) {
		const page = await recheck(db, claim, claim.verifiedTarget ?? "", now, dns);
		if (!page) continue;

		result.lapsed += 1;
		try {
			const to = await ownersAndAdmins(db, page.organizationId);
			await sendNotice(to, { domain: claim.domain, page });
		} catch {
			result.unnotified += 1;
		}
	}
	return result;
}
