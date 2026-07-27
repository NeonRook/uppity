import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { organization, member, user } from "$lib/server/db/auth-schema";
import * as schema from "$lib/server/db/schema";
import { monitor, incident } from "$lib/server/db/schema";
import { eq, desc, ilike, or, count, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";

import { auditService, AuditService, type Actor } from "./audit.service";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * The slice of Better Auth's server API this service needs.
 *
 * Typed as a projection of the real `auth.api` so production passes `auth.api`
 * itself — there is no wrapper to drift out of sync. Tests substitute a stub,
 * because `auth.api` is bound to Better Auth's own database handle and cannot
 * be redirected at the test fixture's database.
 */
export type AdminAuthApi = Pick<
	typeof auth.api,
	| "banUser"
	| "unbanUser"
	| "setRole"
	| "listUserSessions"
	| "revokeUserSession"
	| "revokeUserSessions"
	| "impersonateUser"
	| "stopImpersonating"
>;

export interface CreateOrganizationInput {
	name: string;
	slug: string;
	logo?: string | null;
}

export interface UpdateOrganizationInput {
	name?: string;
	slug?: string;
	logo?: string | null;
}

export interface OrganizationWithMembers {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	createdAt: Date;
	members: {
		id: string;
		role: string;
		createdAt: Date;
		user: {
			id: string;
			name: string;
			email: string;
		};
	}[];
}

export interface DashboardStats {
	totalUsers: number;
	totalOrganizations: number;
	totalMonitors: number;
	totalIncidents: number;
	recentUsers: {
		id: string;
		name: string;
		email: string;
		createdAt: Date;
	}[];
	recentOrganizations: {
		id: string;
		name: string;
		slug: string;
		createdAt: Date;
	}[];
}

export class AdminService {
	private db: Db;
	private audit: AuditService;
	private authApi: AdminAuthApi;

	constructor(database: Db, audit: AuditService, authApi: AdminAuthApi) {
		this.db = database;
		this.audit = audit;
		this.authApi = authApi;
	}

	async getDashboardStats(): Promise<DashboardStats> {
		const [userCount] = await this.db.select({ count: count() }).from(user);
		const [orgCount] = await this.db.select({ count: count() }).from(organization);
		const [monitorCount] = await this.db.select({ count: count() }).from(monitor);
		const [incidentCount] = await this.db.select({ count: count() }).from(incident);

		const recentUsers = await this.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				createdAt: user.createdAt,
			})
			.from(user)
			.orderBy(desc(user.createdAt))
			.limit(5);

		const recentOrganizations = await this.db
			.select({
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				createdAt: organization.createdAt,
			})
			.from(organization)
			.orderBy(desc(organization.createdAt))
			.limit(5);

		return {
			totalUsers: userCount.count,
			totalOrganizations: orgCount.count,
			totalMonitors: monitorCount.count,
			totalIncidents: incidentCount.count,
			recentUsers,
			recentOrganizations,
		};
	}

	async listAllOrganizations(
		limit: number = 50,
		offset: number = 0,
		search?: string,
	): Promise<{ organizations: OrganizationWithMembers[]; total: number }> {
		let query = this.db.select().from(organization).$dynamic();

		if (search) {
			query = query.where(
				or(ilike(organization.name, `%${search}%`), ilike(organization.slug, `%${search}%`)),
			);
		}

		const [totalResult] = await this.db
			.select({ count: count() })
			.from(organization)
			.where(
				search
					? or(ilike(organization.name, `%${search}%`), ilike(organization.slug, `%${search}%`))
					: undefined,
			);

		const orgs = await query.orderBy(desc(organization.createdAt)).limit(limit).offset(offset);

		// Fetch members for each organization
		const orgsWithMembers: OrganizationWithMembers[] = await Promise.all(
			orgs.map(async (org) => {
				const members = await this.getOrganizationMembers(org.id);
				return Object.assign(org, { members });
			}),
		);

		return {
			organizations: orgsWithMembers,
			total: totalResult.count,
		};
	}

	async getOrganizationById(id: string): Promise<OrganizationWithMembers | null> {
		const [org] = await this.db.select().from(organization).where(eq(organization.id, id)).limit(1);

		if (!org) return null;

		const members = await this.getOrganizationMembers(id);

		return {
			...org,
			members,
		};
	}

	private async getOrganizationMembers(organizationId: string) {
		const membersResult = await this.db
			.select({
				id: member.id,
				role: member.role,
				createdAt: member.createdAt,
				userId: user.id,
				userName: user.name,
				userEmail: user.email,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, organizationId))
			.orderBy(desc(member.createdAt));

		return membersResult.map((m) => ({
			id: m.id,
			role: m.role,
			createdAt: m.createdAt,
			user: {
				id: m.userId,
				name: m.userName,
				email: m.userEmail,
			},
		}));
	}

	// --- Drizzle-native mutations -------------------------------------------
	//
	// Mutation and audit row share one transaction, so they are genuinely atomic:
	// a rollback takes the audit row with it, and a committed mutation is always
	// accompanied by its record.

	async createOrganization(actor: Actor, input: CreateOrganizationInput) {
		const id = nanoid();
		const now = new Date();

		return this.db.transaction(async (tx) => {
			const [org] = await tx
				.insert(organization)
				.values({
					id,
					name: input.name,
					slug: input.slug,
					logo: input.logo || null,
					createdAt: now,
				})
				.returning();

			await this.audit.record(tx, actor, {
				action: "org.create",
				targetType: "organization",
				targetId: org.id,
				targetLabel: org.name,
				metadata: { slug: org.slug },
			});

			return org;
		});
	}

	async updateOrganization(actor: Actor, id: string, input: UpdateOrganizationInput) {
		return this.db.transaction(async (tx) => {
			const [existing] = await tx
				.select()
				.from(organization)
				.where(eq(organization.id, id))
				.limit(1);

			if (!existing) return null;

			// Compare against current values so the audit row says what changed,
			// not merely what was submitted.
			const changed = (["name", "slug", "logo"] as const).filter(
				(key) => input[key] !== undefined && input[key] !== existing[key],
			);

			const [updated] = await tx
				.update(organization)
				.set(input)
				.where(eq(organization.id, id))
				.returning();

			await this.audit.record(tx, actor, {
				action: "org.update",
				targetType: "organization",
				targetId: id,
				targetLabel: updated.name,
				metadata: { changed },
			});

			return updated;
		});
	}

	async deleteOrganization(actor: Actor, id: string): Promise<boolean> {
		return this.db.transaction(async (tx) => {
			const [existing] = await tx
				.select()
				.from(organization)
				.where(eq(organization.id, id))
				.limit(1);

			if (!existing) return false;

			const [memberCountResult] = await tx
				.select({ count: count() })
				.from(member)
				.where(eq(member.organizationId, id));

			const result = await tx.delete(organization).where(eq(organization.id, id)).returning();

			await this.audit.record(tx, actor, {
				action: "org.delete",
				targetType: "organization",
				targetId: id,
				targetLabel: existing.name,
				metadata: { slug: existing.slug, memberCount: memberCountResult.count },
			});

			return result.length > 0;
		});
	}

	async addMemberToOrg(actor: Actor, orgId: string, userId: string, role: string = "member") {
		const id = nanoid();
		const now = new Date();

		return this.db.transaction(async (tx) => {
			const [newMember] = await tx
				.insert(member)
				.values({ id, organizationId: orgId, userId, role, createdAt: now })
				.returning();

			const [target] = await tx
				.select({ email: user.email })
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);

			await this.audit.record(tx, actor, {
				action: "org.member_add",
				targetType: "member",
				targetId: newMember.id,
				targetLabel: target?.email,
				metadata: { orgId, userId, role },
			});

			return newMember;
		});
	}

	async removeMemberFromOrg(actor: Actor, memberId: string): Promise<boolean> {
		return this.db.transaction(async (tx) => {
			const [existing] = await tx
				.select({
					id: member.id,
					organizationId: member.organizationId,
					userId: member.userId,
					email: user.email,
				})
				.from(member)
				.innerJoin(user, eq(member.userId, user.id))
				.where(eq(member.id, memberId))
				.limit(1);

			if (!existing) return false;

			const result = await tx.delete(member).where(eq(member.id, memberId)).returning();

			await this.audit.record(tx, actor, {
				action: "org.member_remove",
				targetType: "member",
				targetId: memberId,
				targetLabel: existing.email,
				metadata: { orgId: existing.organizationId, userId: existing.userId },
			});

			return result.length > 0;
		});
	}

	// --- Better-Auth-mediated mutations --------------------------------------
	//
	// These cannot share a transaction with their audit row: auth.api runs against
	// Better Auth's own database handle. The mutation happens first, the audit row
	// second, and a failure to write the audit row throws rather than being
	// swallowed. A crash between the two steps can leave a mutation unaudited —
	// that gap is documented rather than hidden behind a transaction that would
	// only look atomic.

	async banUser(
		actor: Actor,
		headers: Headers,
		userId: string,
		userLabel: string,
		reason?: string,
	): Promise<void> {
		await this.authApi.banUser({
			headers,
			body: { userId, ...(reason && { banReason: reason }) },
		});

		await this.audit.record(this.db, actor, {
			action: "user.ban",
			targetType: "user",
			targetId: userId,
			targetLabel: userLabel,
			metadata: reason ? { reason } : {},
		});
	}

	async unbanUser(
		actor: Actor,
		headers: Headers,
		userId: string,
		userLabel: string,
	): Promise<void> {
		await this.authApi.unbanUser({ headers, body: { userId } });

		await this.audit.record(this.db, actor, {
			action: "user.unban",
			targetType: "user",
			targetId: userId,
			targetLabel: userLabel,
		});
	}

	async setUserRole(
		actor: Actor,
		headers: Headers,
		userId: string,
		role: "user" | "admin",
		currentRole: string,
		userLabel: string,
	): Promise<void> {
		await this.authApi.setRole({ headers, body: { userId, role } });

		await this.audit.record(this.db, actor, {
			action: "user.role_change",
			targetType: "user",
			targetId: userId,
			targetLabel: userLabel,
			metadata: { from: currentRole, to: role },
		});
	}

	async listUserSessions(headers: Headers, userId: string) {
		const result = await this.authApi.listUserSessions({ headers, body: { userId } });
		return result.sessions;
	}

	async revokeUserSession(
		actor: Actor,
		headers: Headers,
		sessionToken: string,
		userId: string,
		ipAddress?: string | null,
	): Promise<void> {
		await this.authApi.revokeUserSession({ headers, body: { sessionToken } });

		await this.audit.record(this.db, actor, {
			action: "user.session_revoke",
			targetType: "session",
			targetId: sessionToken,
			metadata: { userId, ...(ipAddress ? { ipAddress } : {}) },
		});
	}

	async revokeAllUserSessions(
		actor: Actor,
		headers: Headers,
		userId: string,
		userLabel: string,
	): Promise<void> {
		// Counted before the revoke, because afterwards there is nothing to count.
		const sessions = await this.listUserSessions(headers, userId);

		await this.authApi.revokeUserSessions({ headers, body: { userId } });

		await this.audit.record(this.db, actor, {
			action: "user.sessions_revoke_all",
			targetType: "user",
			targetId: userId,
			targetLabel: userLabel,
			metadata: { count: sessions.length },
		});
	}

	async impersonateUser(
		actor: Actor,
		headers: Headers,
		userId: string,
		userLabel: string,
	): Promise<void> {
		await this.authApi.impersonateUser({ headers, body: { userId } });

		await this.audit.record(this.db, actor, {
			action: "user.impersonate_start",
			targetType: "user",
			targetId: userId,
			targetLabel: userLabel,
		});
	}

	async stopImpersonating(
		actor: Actor,
		headers: Headers,
		impersonatedUserId: string,
		userLabel: string,
	): Promise<void> {
		await this.authApi.stopImpersonating({ headers });

		await this.audit.record(this.db, actor, {
			action: "user.impersonate_stop",
			targetType: "user",
			targetId: impersonatedUserId,
			targetLabel: userLabel,
		});
	}

	async listAllUsers(
		limit: number = 50,
		offset: number = 0,
		search?: string,
	): Promise<{ users: (typeof user.$inferSelect)[]; total: number }> {
		let whereClause;
		if (search) {
			whereClause = or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`));
		}

		const [totalResult] = await this.db.select({ count: count() }).from(user).where(whereClause);

		const users = await this.db
			.select()
			.from(user)
			.where(whereClause)
			.orderBy(desc(user.createdAt))
			.limit(limit)
			.offset(offset);

		return {
			users,
			total: totalResult.count,
		};
	}

	async getUsersNotInOrg(orgId: string) {
		// Get users who are not members of this organization
		const usersInOrg = this.db
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, orgId));

		const users = await this.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
			})
			.from(user)
			.where(sql`${user.id} NOT IN (${usersInOrg})`)
			.orderBy(user.name)
			.limit(100);

		return users;
	}
}

export const adminService = new AdminService(db, auditService, auth.api);
