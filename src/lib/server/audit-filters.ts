import {
	AUDIT_ACTIONS,
	AUDIT_TARGET_TYPES,
	type AuditAction,
	type AuditTargetType,
} from "$lib/constants/audit";
import type { AuditFilters } from "$lib/server/services/audit.service";

/**
 * Reads audit filters off a URL.
 *
 * Lives in its own module rather than in `+page.server.ts` because SvelteKit
 * only permits a fixed set of exports from route files. Shared by the audit
 * list page and the CSV export endpoint so a download always covers exactly
 * the rows the operator is looking at.
 *
 * Unrecognised values are dropped rather than rejected — a hand-edited or stale
 * link should degrade to a broader view, not a 400.
 */
export function parseAuditFilters(url: URL): AuditFilters & { page: number } {
	const raw = url.searchParams;

	const action = raw.get("action");
	const targetType = raw.get("targetType");
	const from = raw.get("from");
	const to = raw.get("to");
	const page = Math.max(1, parseInt(raw.get("page") || "1", 10) || 1);

	const fromDate = from ? new Date(from) : undefined;
	// `to` comes from a date-only input; include the whole day rather than midnight.
	const toDate = to ? new Date(`${to}T23:59:59.999Z`) : undefined;

	return {
		action: AUDIT_ACTIONS.includes(action as AuditAction) ? (action as AuditAction) : undefined,
		actorId: raw.get("actorId") || undefined,
		targetType: AUDIT_TARGET_TYPES.includes(targetType as AuditTargetType)
			? (targetType as AuditTargetType)
			: undefined,
		targetId: raw.get("targetId") || undefined,
		from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
		to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
		page,
	};
}
