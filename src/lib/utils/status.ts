import type { Component } from "svelte";

import {
	Pause,
	CircleCheckBig,
	CircleX,
	Clock,
	TriangleAlert,
	type IconProps,
} from "@lucide/svelte";

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive";
export type IconComponent = Component<IconProps>;

/**
 * Get the background color class for a monitor status indicator
 */
export function getStatusColor(status: string | null, active: boolean): string {
	if (!active) return "bg-muted";
	switch (status) {
		case "up":
			return "bg-green-500";
		case "degraded":
			return "bg-yellow-500";
		case "down":
			return "bg-red-500";
		default:
			return "bg-muted";
	}
}

/**
 * Get the text label for a monitor status
 */
export function getStatusLabel(status: string | null, active: boolean): string {
	if (!active) return "Paused";
	switch (status) {
		case "up":
			return "Operational";
		case "degraded":
			return "Degraded";
		case "down":
			return "Down";
		default:
			return "Unknown";
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
		return { variant: "secondary", label: "Paused" };
	}
	switch (status) {
		case "up":
			return { variant: "default", label: "Operational" };
		case "degraded":
			return { variant: "outline", label: "Degraded" };
		case "down":
			return { variant: "destructive", label: "Down" };
		default:
			return { variant: "secondary", label: "Unknown" };
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
		return { variant: "secondary", label: "Paused", icon: Pause };
	}
	switch (status) {
		case "up":
			return { variant: "default", label: "Operational", icon: CircleCheckBig };
		case "degraded":
			return { variant: "outline", label: "Degraded", icon: TriangleAlert };
		case "down":
			return { variant: "destructive", label: "Down", icon: CircleX };
		default:
			return { variant: "secondary", label: "Unknown", icon: Clock };
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
			return { component: CircleCheckBig, class: "text-green-500" };
		case "degraded":
			return { component: TriangleAlert, class: "text-yellow-500" };
		case "down":
			return { component: CircleX, class: "text-red-500" };
		default:
			return { component: Clock, class: "text-muted-foreground" };
	}
}

/**
 * Get the background color class for a monitor status (without active state)
 * Used for public status pages
 */
export function getMonitorStatusColor(status: string): string {
	switch (status) {
		case "up":
			return "bg-green-500";
		case "down":
			return "bg-red-500";
		case "degraded":
			return "bg-yellow-500";
		default:
			return "bg-gray-400";
	}
}

/**
 * Get the background color with hover state for uptime bar days
 */
export function getDayStatusColor(status: string): string {
	switch (status) {
		case "up":
			return "bg-green-500 hover:bg-green-400";
		case "down":
			return "bg-red-500 hover:bg-red-400";
		case "degraded":
			return "bg-yellow-500 hover:bg-yellow-400";
		case "partial":
			return "bg-orange-500 hover:bg-orange-400";
		default:
			return "bg-gray-300 hover:bg-gray-200";
	}
}
