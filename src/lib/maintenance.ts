import { m } from "$lib/paraglide/messages.js";
import type { BadgeVariant } from "$lib/utils/status";

export interface MaintenanceStatusBadge {
	label: string;
	variant: BadgeVariant;
	/**
	 * Extra classes the variant alone cannot express. Returned from here rather than
	 * applied at call sites: DESIGN.md requires the status→appearance mapping to live
	 * in one function and not be re-derived where it is rendered.
	 */
	class?: string;
}

/**
 * Map a maintenance window status to a translated label and badge appearance.
 *
 * Signal semantics, per DESIGN.md:
 *
 * - `in_progress` is Ward Blue (`maintenance`). It is the only *live* signal this
 *   surface emits, and the design system reserves the cool hue for it precisely so
 *   planned downtime is never mistaken for failure. It must not be `default`:
 *   `badge-default` is Vital Emerald, which means "operational".
 * - `cancelled` must not be `destructive`. Alarm Scarlet is reserved for a monitor
 *   that is down; a window someone chose not to run is not a failure, and painting
 *   it scarlet is the alarm inflation the Signal Monopoly Rule prohibits. It is a
 *   muted, dashed outline instead — the same "this was never real" device the
 *   landing page uses for unpublished competitor tiers.
 * - `completed` and `cancelled` are the only two states that ever render beside each
 *   other (both land in the Past section), so they are the pair that must stay
 *   distinguishable without reading the label.
 */
export function getMaintenanceStatusBadge(status: string): MaintenanceStatusBadge {
	switch (status) {
		case "scheduled":
			return { label: m.maintenance_status_scheduled(), variant: "secondary" };
		case "in_progress":
			return { label: m.maintenance_status_in_progress(), variant: "maintenance" };
		case "completed":
			return { label: m.maintenance_status_completed(), variant: "outline" };
		case "cancelled":
			return {
				label: m.maintenance_status_cancelled(),
				variant: "outline",
				class: "text-muted-foreground border-dashed",
			};
		default:
			return { label: status, variant: "secondary" };
	}
}
