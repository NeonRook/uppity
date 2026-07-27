import {
	AUDIT_EXPORT_LIMIT,
	AUDIT_PAGE_SIZE,
	type AuditAction,
	type AuditTargetType,
} from "$lib/constants/audit";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { auditLog, type AuditLog } from "$lib/server/db/schema";
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";

type Db = PostgresJsDatabase<typeof schema>;

/** A `db` handle or a transaction handle — `record` accepts either. */
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface Actor {
	id: string;
	email: string;
	ip: string | null;
	userAgent: string | null;
}

export interface AuditEntry {
	action: AuditAction;
	targetType?: AuditTargetType;
	targetId?: string;
	targetLabel?: string;
	metadata?: Record<string, unknown>;
}

export interface AuditFilters {
	action?: AuditAction;
	actorId?: string;
	targetType?: AuditTargetType;
	targetId?: string;
	from?: Date;
	to?: Date;
	limit?: number;
	offset?: number;
}

const CSV_HEADER =
	"created_at,actor_email,action,target_type,target_id,target_label,ip_address,metadata";

/** RFC 4180 quoting: wrap when the value contains a delimiter, quote, or newline. */
function csvCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	const raw = typeof value === "string" ? value : JSON.stringify(value);
	if (!/[",\n\r]/.test(raw)) return raw;
	return `"${raw.replaceAll('"', '""')}"`;
}

export class AuditService {
	private db: Db;

	constructor(database: Db) {
		this.db = database;
	}

	/**
	 * Writes one audit row.
	 *
	 * `executor` is explicit rather than defaulted so the call site has to state
	 * whether the row shares a transaction with the mutation it describes. For
	 * Drizzle-native mutations pass the transaction handle; for Better-Auth-mediated
	 * ones pass `db` and accept the documented non-atomic gap.
	 *
	 * Never swallow a rejection from this method — an unaudited mutation is the
	 * exact failure mode the audit log exists to prevent.
	 */
	async record(executor: DbExecutor, actor: Actor, entry: AuditEntry): Promise<AuditLog> {
		const [row] = await executor
			.insert(auditLog)
			.values({
				id: nanoid(),
				actorId: actor.id,
				actorEmail: actor.email,
				action: entry.action,
				targetType: entry.targetType,
				targetId: entry.targetId,
				targetLabel: entry.targetLabel,
				metadata: entry.metadata,
				ipAddress: actor.ip,
				userAgent: actor.userAgent,
			})
			.returning();

		return row;
	}

	private buildWhere(filters: AuditFilters): SQL | undefined {
		const clauses: SQL[] = [];
		if (filters.action) clauses.push(eq(auditLog.action, filters.action));
		if (filters.actorId) clauses.push(eq(auditLog.actorId, filters.actorId));
		if (filters.targetType) clauses.push(eq(auditLog.targetType, filters.targetType));
		if (filters.targetId) clauses.push(eq(auditLog.targetId, filters.targetId));
		if (filters.from) clauses.push(gte(auditLog.createdAt, filters.from));
		if (filters.to) clauses.push(lte(auditLog.createdAt, filters.to));
		return clauses.length > 0 ? and(...clauses) : undefined;
	}

	async list(filters: AuditFilters): Promise<{ entries: AuditLog[]; total: number }> {
		const where = this.buildWhere(filters);

		const [totalResult] = await this.db.select({ count: count() }).from(auditLog).where(where);

		// The secondary sort on `id` keeps pagination deterministic: `created_at`
		// has millisecond resolution and rows written in one transaction can share
		// a timestamp, which would otherwise drop or duplicate rows across pages.
		const entries = await this.db
			.select()
			.from(auditLog)
			.where(where)
			.orderBy(desc(auditLog.createdAt), desc(auditLog.id))
			.limit(filters.limit ?? AUDIT_PAGE_SIZE)
			.offset(filters.offset ?? 0);

		return { entries, total: totalResult.count };
	}

	/**
	 * Renders matching entries as CSV. Uses a large limit rather than the paging
	 * default so an export is not silently truncated to one page.
	 */
	async exportCsv(filters: AuditFilters): Promise<string> {
		const { entries } = await this.list({ ...filters, limit: AUDIT_EXPORT_LIMIT, offset: 0 });

		const rows = entries.map((e) =>
			[
				e.createdAt.toISOString(),
				csvCell(e.actorEmail),
				csvCell(e.action),
				csvCell(e.targetType),
				csvCell(e.targetId),
				csvCell(e.targetLabel),
				csvCell(e.ipAddress),
				csvCell(e.metadata),
			].join(","),
		);

		return `${[CSV_HEADER, ...rows].join("\n")}\n`;
	}
}

export const auditService = new AuditService(db);
