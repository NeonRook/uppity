import { and, eq } from "drizzle-orm";

import { member } from "#lib/server/db/auth-schema.js";
import { db } from "#lib/server/db/index.js";

const MANAGER_ROLES: ReadonlySet<string> = new Set(["owner", "admin"]);

/** Whether the user is an owner or admin of the organization. */
export async function canManage(organizationId: string, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
	return row !== undefined && MANAGER_ROLES.has(row.role);
}
