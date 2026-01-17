export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export const CHECK_INTERVALS = [
	{ value: "30", label: "30 seconds" },
	{ value: "60", label: "1 minute" },
	{ value: "120", label: "2 minutes" },
	{ value: "300", label: "5 minutes" },
	{ value: "600", label: "10 minutes" },
	{ value: "900", label: "15 minutes" },
	{ value: "1800", label: "30 minutes" },
	{ value: "3600", label: "1 hour" },
] as const;

export function getIntervalLabel(value: string): string {
	return CHECK_INTERVALS.find((i) => i.value === value)?.label ?? `${value} seconds`;
}
