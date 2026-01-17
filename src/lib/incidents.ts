import type { Component } from "svelte";

import {
	Search,
	Eye,
	Clock,
	CircleCheckBig,
	TriangleAlert,
	FileText,
	type IconProps,
} from "@lucide/svelte";

export type IncidentStatus =
	| "investigating"
	| "identified"
	| "monitoring"
	| "resolved"
	| "postmortem";
export type IncidentImpact = "none" | "minor" | "major" | "critical";

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

export const statusOptions = [
	{ value: "investigating", label: "Investigating", icon: Search },
	{ value: "identified", label: "Identified", icon: Eye },
	{ value: "monitoring", label: "Monitoring", icon: Clock },
	{ value: "resolved", label: "Resolved", icon: CircleCheckBig },
] as const;

export const impactOptions = [
	{ value: "none", label: "None" },
	{ value: "minor", label: "Minor" },
	{ value: "major", label: "Major" },
	{ value: "critical", label: "Critical" },
] as const;

export function getStatusInfo(status: string): StatusInfo {
	switch (status) {
		case "investigating":
			return {
				label: "Investigating",
				icon: Search,
				variant: "destructive",
				color: "text-red-600",
				bg: "bg-red-100",
			};
		case "identified":
			return {
				label: "Identified",
				icon: Eye,
				variant: "destructive",
				color: "text-orange-600",
				bg: "bg-orange-100",
			};
		case "monitoring":
			return {
				label: "Monitoring",
				icon: Clock,
				variant: "secondary",
				color: "text-yellow-600",
				bg: "bg-yellow-100",
			};
		case "resolved":
			return {
				label: "Resolved",
				icon: CircleCheckBig,
				variant: "outline",
				color: "text-green-600",
				bg: "bg-green-100",
			};
		case "postmortem":
			return {
				label: "Postmortem",
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
				label: "None",
				variant: "outline",
				color: "text-gray-600",
				bg: "bg-gray-100",
			};
		case "minor":
			return {
				label: "Minor",
				variant: "secondary",
				color: "text-yellow-700",
				bg: "bg-yellow-100",
			};
		case "major":
			return {
				label: "Major",
				variant: "destructive",
				color: "text-orange-700",
				bg: "bg-orange-100",
			};
		case "critical":
			return {
				label: "Critical",
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
