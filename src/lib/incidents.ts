import type { Component } from "svelte";

import { m } from "$lib/paraglide/messages.js";
import {
	Search,
	Eye,
	Clock,
	CircleCheckBig,
	TriangleAlert,
	FileText,
	type IconProps,
} from "@lucide/svelte";

type IconComponent = Component<IconProps>;

export interface StatusInfo {
	label: string;
	icon: IconComponent;
	variant: "destructive" | "secondary" | "outline";
	color: string;
	bg: string;
}

export interface ImpactInfo {
	label: string;
	variant: "destructive" | "secondary" | "outline";
	color: string;
	bg: string;
}

export function getStatusOptions() {
	return [
		{ value: "investigating", label: m.incident_status_investigating(), icon: Search },
		{ value: "identified", label: m.incident_status_identified(), icon: Eye },
		{ value: "monitoring", label: m.incident_status_monitoring(), icon: Clock },
		{ value: "resolved", label: m.incident_status_resolved(), icon: CircleCheckBig },
	] as const;
}

export function getImpactOptions() {
	return [
		{ value: "none", label: m.incident_impact_none() },
		{ value: "minor", label: m.incident_impact_minor() },
		{ value: "major", label: m.incident_impact_major() },
		{ value: "critical", label: m.incident_impact_critical() },
	] as const;
}

export function getStatusLabel(status: string): string {
	switch (status) {
		case "investigating":
			return m.incident_status_investigating();
		case "identified":
			return m.incident_status_identified();
		case "monitoring":
			return m.incident_status_monitoring();
		case "resolved":
			return m.incident_status_resolved();
		case "postmortem":
			return m.incident_status_postmortem();
		default:
			return status;
	}
}

export function getImpactLabel(impact: string): string {
	switch (impact) {
		case "none":
			return m.incident_impact_none();
		case "minor":
			return m.incident_impact_minor();
		case "major":
			return m.incident_impact_major();
		case "critical":
			return m.incident_impact_critical();
		default:
			return impact;
	}
}

export function getImpactDescription(impact: string): string {
	switch (impact) {
		case "none":
			return m.incident_impact_none_desc();
		case "minor":
			return m.incident_impact_minor_desc();
		case "major":
			return m.incident_impact_major_desc();
		case "critical":
			return m.incident_impact_critical_desc();
		default:
			return "";
	}
}

export function getStatusInfo(status: string): StatusInfo {
	switch (status) {
		case "investigating":
			return {
				label: m.incident_status_investigating(),
				icon: Search,
				variant: "destructive",
				color: "text-red-600",
				bg: "bg-red-100",
			};
		case "identified":
			return {
				label: m.incident_status_identified(),
				icon: Eye,
				variant: "destructive",
				color: "text-orange-600",
				bg: "bg-orange-100",
			};
		case "monitoring":
			return {
				label: m.incident_status_monitoring(),
				icon: Clock,
				variant: "secondary",
				color: "text-yellow-600",
				bg: "bg-yellow-100",
			};
		case "resolved":
			return {
				label: m.incident_status_resolved(),
				icon: CircleCheckBig,
				variant: "outline",
				color: "text-green-600",
				bg: "bg-green-100",
			};
		case "postmortem":
			return {
				label: m.incident_status_postmortem(),
				icon: FileText,
				variant: "outline",
				color: "text-blue-600",
				bg: "bg-blue-100",
			};
		default:
			return {
				label: status,
				icon: TriangleAlert,
				variant: "secondary",
				color: "text-gray-600",
				bg: "bg-gray-100",
			};
	}
}

export function getImpactInfo(impact: string): ImpactInfo {
	switch (impact) {
		case "none":
			return {
				label: m.incident_impact_none(),
				variant: "outline",
				color: "text-gray-600",
				bg: "bg-gray-100",
			};
		case "minor":
			return {
				label: m.incident_impact_minor(),
				variant: "secondary",
				color: "text-yellow-700",
				bg: "bg-yellow-100",
			};
		case "major":
			return {
				label: m.incident_impact_major(),
				variant: "destructive",
				color: "text-orange-700",
				bg: "bg-orange-100",
			};
		case "critical":
			return {
				label: m.incident_impact_critical(),
				variant: "destructive",
				color: "text-red-700",
				bg: "bg-red-100",
			};
		default:
			return {
				label: impact,
				variant: "secondary",
				color: "text-gray-600",
				bg: "bg-gray-100",
			};
	}
}

export function formatIncidentDate(date: Date): string {
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatIncidentDateTime(date: Date): string {
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
