import {
	Search,
	Eye,
	Clock,
	CircleCheckBig,
	TriangleAlert,
	FileText,
	type LucideIcon,
} from "@lucide/svelte";

import { m } from "#lib/paraglide/messages.js";

export {
	formatDateTimeShort as formatIncidentDate,
	formatDateTimeMonthDay as formatIncidentDateTime,
} from "#lib/format.js";

type Variant = "destructive" | "secondary" | "outline";

export interface StatusInfo {
	label: string;
	icon: LucideIcon;
	variant: Variant;
	color: string;
	bg: string;
}

export interface ImpactInfo {
	label: string;
	variant: Variant;
	color: string;
	bg: string;
}

// Full class names, so Tailwind can see them.
const TONE = {
	down: { color: "text-status-down-ink", bg: "bg-status-down-surface" },
	partial: { color: "text-status-partial-ink", bg: "bg-status-partial-surface" },
	degraded: { color: "text-status-degraded-ink", bg: "bg-status-degraded-surface" },
	up: { color: "text-status-up-ink", bg: "bg-status-up-surface" },
	maintenance: { color: "text-status-maintenance-ink", bg: "bg-status-maintenance-surface" },
	unknown: { color: "text-status-unknown-ink", bg: "bg-status-unknown-surface" },
};

const STATUSES = {
	investigating: {
		label: m.incident_status_investigating,
		icon: Search,
		variant: "destructive",
		...TONE.down,
	},
	identified: {
		label: m.incident_status_identified,
		icon: Eye,
		variant: "destructive",
		...TONE.partial,
	},
	monitoring: {
		label: m.incident_status_monitoring,
		icon: Clock,
		variant: "secondary",
		...TONE.degraded,
	},
	resolved: {
		label: m.incident_status_resolved,
		icon: CircleCheckBig,
		variant: "outline",
		...TONE.up,
	},
	postmortem: {
		label: m.incident_status_postmortem,
		icon: FileText,
		variant: "outline",
		...TONE.maintenance,
	},
} as const;

const IMPACTS = {
	none: {
		label: m.incident_impact_none,
		description: m.incident_impact_none_desc,
		variant: "outline",
		...TONE.unknown,
	},
	minor: {
		label: m.incident_impact_minor,
		description: m.incident_impact_minor_desc,
		variant: "secondary",
		...TONE.degraded,
	},
	major: {
		label: m.incident_impact_major,
		description: m.incident_impact_major_desc,
		variant: "destructive",
		...TONE.partial,
	},
	critical: {
		label: m.incident_impact_critical,
		description: m.incident_impact_critical_desc,
		variant: "destructive",
		...TONE.down,
	},
} as const;

function lookup<T>(table: Record<string, T>, key: string): T | undefined {
	return Object.hasOwn(table, key) ? table[key] : undefined;
}

export function getStatusInfo(status: string): StatusInfo {
	const entry = lookup(STATUSES, status);
	if (!entry) {
		return { label: status, icon: TriangleAlert, variant: "secondary", ...TONE.unknown };
	}
	return { ...entry, label: entry.label() };
}

export function getImpactInfo(impact: string): ImpactInfo {
	const entry = lookup(IMPACTS, impact);
	if (!entry) return { label: impact, variant: "secondary", ...TONE.unknown };
	return { label: entry.label(), variant: entry.variant, color: entry.color, bg: entry.bg };
}

export function getStatusLabel(status: string): string {
	return getStatusInfo(status).label;
}

export function getImpactLabel(impact: string): string {
	return getImpactInfo(impact).label;
}

export function getImpactDescription(impact: string): string {
	return lookup(IMPACTS, impact)?.description() ?? "";
}
