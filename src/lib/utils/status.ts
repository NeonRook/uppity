import {
	Pause,
	CircleCheckBig,
	CircleX,
	Clock,
	TriangleAlert,
	type LucideIcon,
} from "@lucide/svelte";

// Re-exported rather than restated: the union is derived from badgeVariants' own
// `tv` config, so a variant added to the component cannot silently fail to exist here.
import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import { m } from "#lib/paraglide/messages.js";

export type { BadgeVariant };

interface StateStyle {
	label: () => string;
	variant: BadgeVariant;
	icon: LucideIcon;
	bg: string;
	text: string;
}

// Full class names, so Tailwind can see them.
const UNKNOWN: StateStyle = {
	label: m.status_unknown,
	variant: "secondary",
	icon: Clock,
	bg: "bg-status-unknown",
	text: "text-status-unknown",
};

const PAUSED: StateStyle = { ...UNKNOWN, label: m.status_paused, icon: Pause };

const STATES: Record<string, StateStyle> = {
	up: {
		label: m.status_operational,
		variant: "default",
		icon: CircleCheckBig,
		bg: "bg-status-up",
		text: "text-status-up",
	},
	degraded: {
		label: m.status_degraded,
		variant: "outline",
		icon: TriangleAlert,
		bg: "bg-status-degraded",
		text: "text-status-degraded",
	},
	down: {
		label: m.status_down,
		variant: "destructive",
		icon: CircleX,
		bg: "bg-status-down",
		text: "text-status-down",
	},
};

function styleOf(status: string | null, active = true): StateStyle {
	if (!active) return PAUSED;
	return (status !== null && Object.hasOwn(STATES, status) ? STATES[status] : undefined) ?? UNKNOWN;
}

/**
 * Get the background color class for a monitor status indicator
 */
export function getStatusColor(status: string | null, active: boolean): string {
	return styleOf(status, active).bg;
}

/**
 * Get the text label for a monitor status
 */
export function getStatusLabel(status: string | null, active: boolean): string {
	return styleOf(status, active).label();
}

/**
 * Get badge variant and label for a monitor status
 */
export function getStatusBadge(
	status: string | null,
	active: boolean,
): { variant: BadgeVariant; label: string } {
	const { variant, label } = getStatusBadgeWithIcon(status, active);
	return { variant, label };
}

/**
 * Get badge variant, label, and icon for a monitor status (for detailed views)
 */
export function getStatusBadgeWithIcon(
	status: string | null,
	active: boolean,
): { variant: BadgeVariant; label: string; icon: LucideIcon } {
	const { variant, label, icon } = styleOf(status, active);
	return { variant, label: label(), icon };
}

/**
 * Get icon component and color class for check result status
 */
export function getCheckIcon(status: string): {
	component: LucideIcon;
	class: string;
} {
	const { icon, text } = styleOf(status);
	return { component: icon, class: text };
}

/**
 * Get the background color class for a monitor status (without active state)
 * Used for public status pages
 */
export function getMonitorStatusColor(status: string): string {
	return status === "maintenance" ? "bg-status-maintenance" : styleOf(status).bg;
}

/**
 * Background token for a single day cell in the 90-day uptime bar.
 * The hover treatment lives on the element (`hover:brightness-125`) so the
 * lighten-one-step behaviour works identically in both themes.
 */
export function getDayStatusColor(status: string): string {
	return status === "partial" ? "bg-status-partial" : styleOf(status).bg;
}
