import { db } from "$lib/server/db";
import { organization, member, user } from "$lib/server/db/auth-schema";
import { monitor, incident } from "$lib/server/db/schema";
import { eq, desc, ilike, or, count, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

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
	async getDashboardStats(): Promise<DashboardStats> {
		const [userCount] = await db.select({ count: count() }).from(user);
		const [orgCount] = await db.select({ count: count() }).from(organization);
		const [monitorCount] = await db.select({ count: count() }).from(monitor);
		const [incidentCount] = await db.select({ count: count() }).from(incident);

		const recentUsers = await db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				createdAt: user.createdAt,
			})
			.from(user)
			.orderBy(desc(user.createdAt))
			.limit(5);

		const recentOrganizations = await db
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
		let query = db.select().from(organization).$dynamic();

		if (search) {
			query = query.where(
				or(ilike(organization.name, `%${search}%`), ilike(organization.slug, `%${search}%`)),
			);
		}

		const [totalResult] = await db
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
		const [org] = await db.select().from(organization).where(eq(organization.id, id)).limit(1);

		if (!org) return null;

		const members = await this.getOrganizationMembers(id);

		return {
			...org,
			members,
		};
	}

	private async getOrganizationMembers(organizationId: string) {
		const membersResult = await db
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

	async createOrganization(input: CreateOrganizationInput) {
		const id = nanoid();
		const now = new Date();

		const [org] = await db
			.insert(organization)
			.values({
				id,
				name: input.name,
				slug: input.slug,
				logo: input.logo || null,
				createdAt: now,
			})
			.returning();

		return org;
	}

	async updateOrganization(id: string, input: UpdateOrganizationInput) {
		const [updated] = await db
			.update(organization)
			.set(input)
			.where(eq(organization.id, id))
			.returning();

		return updated || null;
	}

	async deleteOrganization(id: string): Promise<boolean> {
		const result = await db.delete(organization).where(eq(organization.id, id)).returning();

		return result.length > 0;
	}

	async addMemberToOrg(orgId: string, userId: string, role: string = "member") {
		const id = nanoid();
		const now = new Date();

		const [newMember] = await db
			.insert(member)
			.values({
				id,
				organizationId: orgId,
				userId,
				role,
				createdAt: now,
			})
			.returning();

		return newMember;
	}

	async removeMemberFromOrg(memberId: string): Promise<boolean> {
		const result = await db.delete(member).where(eq(member.id, memberId)).returning();

		return result.length > 0;
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

		const [totalResult] = await db.select({ count: count() }).from(user).where(whereClause);

		const users = await db
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
		const usersInOrg = db
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, orgId));

		const users = await db
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

export const adminService = new AdminService();
