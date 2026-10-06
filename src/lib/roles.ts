import { m } from "#lib/paraglide/messages.js";

export function getRoleBadge(role: string) {
	switch (role) {
		case "owner":
			return { variant: "default" as const, label: m.role_owner() };
		case "admin":
			return { variant: "secondary" as const, label: m.role_admin() };
		default:
			return { variant: "outline" as const, label: m.role_member() };
	}
}
