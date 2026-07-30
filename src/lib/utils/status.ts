import { m } from "$lib/paraglide/messages.js";
import {
	Pause,
	CircleCheckBig,
	CircleX,
	Clock,
	TriangleAlert,
	type IconProps,
} from "@lucide/svelte";
import type { Component } from "svelte";

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive";
export type IconComponent = Component<IconProps>;

/**
 * Get the background color class for a monitor status indicator
 */
export function getStatusColor(status: string | null, active: boolean): string {
	if (!active) return "bg-status-unknown";
	switch (status) {
		case "up":
			return "bg-status-up";
		case "degraded":
			return "bg-status-degraded";
		case "down":
			return "bg-status-down";
		default:
			return "bg-status-unknown";
	}
}

/**
 * Get the text label for a monitor status
 */
export function getStatusLabel(status: string | null, active: boolean): string {
	if (!active) return m.status_paused();
	switch (status) {
		case "up":
			return m.status_operational();
		case "degraded":
			return m.status_degraded();
		case "down":
			return m.status_down();
		default:
			return m.status_unknown();
	}
}

/**
 * Get badge variant and label for a monitor status
 */
export function getStatusBadge(
	status: string | null,
	active: boolean,
): { variant: BadgeVariant; label: string } {
	if (!active) {
		return { variant: "secondary", label: m.status_paused() };
	}
	switch (status) {
		case "up":
			return { variant: "default", label: m.status_operational() };
		case "degraded":
			return { variant: "outline", label: m.status_degraded() };
		case "down":
			return { variant: "destructive", label: m.status_down() };
		default:
			return { variant: "secondary", label: m.status_unknown() };
	}
}

/**
 * Get badge variant, label, and icon for a monitor status (for detailed views)
 */
export function getStatusBadgeWithIcon(
	status: string | null,
	active: boolean,
): { variant: BadgeVariant; label: string; icon: IconComponent } {
	if (!active) {
		return { variant: "secondary", label: m.status_paused(), icon: Pause };
	}
	switch (status) {
		case "up":
			return { variant: "default", label: m.status_operational(), icon: CircleCheckBig };
		case "degraded":
			return { variant: "outline", label: m.status_degraded(), icon: TriangleAlert };
		case "down":
			return { variant: "destructive", label: m.status_down(), icon: CircleX };
		default:
			return { variant: "secondary", label: m.status_unknown(), icon: Clock };
	}
}

/**
 * Get icon component and color class for check result status
 */
export function getCheckIcon(status: string): {
	component: IconComponent;
	class: string;
} {
	switch (status) {
		case "up":
			return { component: CircleCheckBig, class: "text-status-up" };
		case "degraded":
			return { component: TriangleAlert, class: "text-status-degraded" };
		case "down":
			return { component: CircleX, class: "text-status-down" };
		default:
			return { component: Clock, class: "text-status-unknown" };
	}
}

/**
 * Get the background color class for a monitor status (without active state)
 * Used for public status pages
 */
export function getMonitorStatusColor(status: string): string {
	switch (status) {
		case "up":
			return "bg-status-up";
		case "down":
			return "bg-status-down";
		case "degraded":
			return "bg-status-degraded";
		case "maintenance":
			return "bg-status-maintenance";
		default:
			return "bg-status-unknown";
	}
}

/**
 * Background token for a single day cell in the 90-day uptime bar.
 * The hover treatment lives on the element (`hover:brightness-125`) so the
 * lighten-one-step behaviour works identically in both themes.
 */
export function getDayStatusColor(status: string): string {
	switch (status) {
		case "up":
			return "bg-status-up";
		case "down":
			return "bg-status-down";
		case "degraded":
			return "bg-status-degraded";
		case "partial":
			return "bg-status-partial";
		default:
			return "bg-status-unknown";
	}
}
