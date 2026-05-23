import { m } from "$lib/paraglide/messages.js";
import type { BadgeVariant } from "$lib/utils/status";

/**
 * Map a maintenance window status to a translated label and badge variant.
 */
export function getMaintenanceStatusBadge(status: string): {
	label: string;
	variant: BadgeVariant;
} {
	switch (status) {
		case "scheduled":
			return { label: m.maintenance_status_scheduled(), variant: "secondary" };
		case "in_progress":
			return { label: m.maintenance_status_in_progress(), variant: "default" };
		case "completed":
			return { label: m.maintenance_status_completed(), variant: "outline" };
		case "cancelled":
			return { label: m.maintenance_status_cancelled(), variant: "destructive" };
		default:
			return { label: status, variant: "secondary" };
	}
}
