/**
 * Generate a URL-friendly slug from a string
 * - Converts to lowercase
 * - Removes special characters (keeps alphanumeric, spaces, and hyphens)
 * - Replaces spaces with hyphens
 * - Collapses multiple hyphens into one
 * - Trims leading/trailing whitespace
 */
export function generateSlug(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Format a date for display
 * Returns a localized string or "-" if null
 */
export function formatDate(date: Date | null): string {
	if (!date) return "-";
	return new Date(date).toLocaleString();
}

/**
 * Format response time in milliseconds
 * Returns formatted string like "123ms" or "-" if null
 */
export function formatResponseTime(ms: number | null): string {
	if (ms === null) return "-";
	return `${ms}ms`;
}

/**
 * Format interval seconds to human readable string
 * e.g., 30 -> "30s", 60 -> "1m", 3600 -> "1h"
 */
export function formatInterval(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	return `${Math.floor(seconds / 3600)}h`;
}

/**
 * Format uptime percentage for display
 * Returns formatted string like "99.9%" or "-" if null
 */
export function formatUptime(percent: number | null): string {
	if (percent === null) return "-";
	return `${percent.toFixed(1)}%`;
}

/**
 * Get relative time string (e.g., "2 hours ago", "5 minutes ago")
 */
export function getRelativeTime(date: Date | null): string {
	if (!date) return "Never";

	const now = Date.now();
	const then = new Date(date).getTime();
	const diffMs = now - then;

	const seconds = Math.floor(diffMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
	if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	if (seconds > 0) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
	return "Just now";
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 3)}...`;
}
