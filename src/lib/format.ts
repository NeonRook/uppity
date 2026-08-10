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
 * Format a date in short format (e.g., "Jan 15, 2024")
 */
export function formatDateShort(date: Date | string | null): string {
	if (!date) return "-";
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * Format a date with time in short format (e.g., "Jan 15, 2024, 09:30 AM")
 */
export function formatDateTimeShort(date: Date | string | null): string {
	if (!date) return "-";
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Format a duration between two dates (e.g., "2d 5h", "3h 20m", "45m")
 */
export function formatDuration(startedAt: Date, resolvedAt: Date | null): string {
	const start = new Date(startedAt);
	const end = resolvedAt ? new Date(resolvedAt) : new Date();
	const diffMs = end.getTime() - start.getTime();

	const minutes = Math.floor(diffMs / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days}d ${hours % 24}h`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	}
	return `${minutes}m`;
}

/**
 * Format a date showing only month and day (e.g., "Jan 15")
 */
export function formatDateMonthDay(date: Date | string | null): string {
	if (!date) return "-";
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
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
 * Convert a Date into the `YYYY-MM-DDTHH:mm` string an `<input type="datetime-local">`
 * expects, expressed in the browser's local time.
 *
 * `toISOString()` alone would hand the control a UTC wall-clock time, so a user in
 * UTC+2 typing 14:00 would see 12:00 read back. Subtracting the offset first is what
 * keeps the round trip honest.
 */
export function dateToLocalInput(value: Date | string | undefined | null): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const offsetMs = date.getTimezoneOffset() * 60_000;
	return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * Parse a `datetime-local` value back into a Date, or null when the control is empty
 * or mid-edit. Null is the caller's signal to let validation surface the problem
 * rather than silently keeping the previous value.
 */
export function localInputToDate(value: string): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format the span of a maintenance window as a single readable range.
 *
 * A window that starts and ends on the same day — the overwhelmingly common case —
 * prints its date once: "Jan 15, 2:00 PM → 4:30 PM". Repeating the date on both sides
 * of the arrow is noise that makes two nearly identical strings hard to tell apart at
 * a glance, which is exactly what the list view asks the reader to do.
 */
export function formatDateTimeRange(
	start: Date | string,
	end: Date | string,
	locale = "en-US",
): string {
	const from = new Date(start);
	const to = new Date(end);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "-";

	const withDate = new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
	const sameDay =
		from.getFullYear() === to.getFullYear() &&
		from.getMonth() === to.getMonth() &&
		from.getDate() === to.getDate();

	if (!sameDay) return `${withDate.format(from)} → ${withDate.format(to)}`;

	const timeOnly = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
	return `${withDate.format(from)} → ${timeOnly.format(to)}`;
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
	{ unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
	{ unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
	{ unit: "day", ms: 24 * 60 * 60 * 1000 },
	{ unit: "hour", ms: 60 * 60 * 1000 },
	{ unit: "minute", ms: 60 * 1000 },
];

/**
 * Format a point in time relative to now, in either direction ("in 3 hours",
 * "2 days ago", "now").
 *
 * Distinct from `getRelativeTime`, which only looks backwards and only speaks
 * English. Maintenance windows are scheduled ahead, so the forward direction is the
 * common case, and the label sits beside translated prose on every surface that uses
 * it. `Intl.RelativeTimeFormat` supplies both for free across en, de and pt-br —
 * German's "in 3 Stunden" / "vor 2 Tagen" needs no message key of its own.
 *
 * `now` is injectable so callers can render against a fixed clock and tests need no
 * timer mocking.
 */
export function formatRelativeTime(
	date: Date | string,
	locale = "en-US",
	now: Date = new Date(),
): string {
	const target = new Date(date).getTime();
	if (Number.isNaN(target)) return "-";

	const diffMs = target - now.getTime();
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

	for (const { unit, ms } of RELATIVE_UNITS) {
		if (Math.abs(diffMs) >= ms) {
			return formatter.format(Math.trunc(diffMs / ms), unit);
		}
	}
	// Under a minute in either direction. `numeric: "auto"` turns 0 into the idiomatic
	// "now" rather than "in 0 seconds".
	return formatter.format(0, "second");
}

/**
 * Name the time zone the browser is rendering times in.
 *
 * Maintenance windows are entered through `datetime-local`, which is silently local
 * to whoever is typing. A distributed team scheduling a window days ahead has no way
 * to tell which zone a time is in unless the UI says so.
 *
 * Prefers the short zone name the locale would write ("CEST", "GMT+2") and falls back
 * to the IANA identifier, which is always available and never ambiguous.
 */
export function getTimeZoneLabel(locale = "en-US", date: Date = new Date()): string {
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const parts = new Intl.DateTimeFormat(locale, {
		timeZoneName: "short",
	}).formatToParts(date);
	return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Formats a US cent amount as a dollar string, showing cents only when the amount
 * is not a whole number of dollars.
 *
 * The conditional precision exists for annual plans: $2,990/year is $249.1666../month,
 * and rendering that as "$249" understates the real charge by $2 a year. Prices that
 * divide evenly — $12, $10 — stay free of decimal noise.
 *
 * The currency is always USD; `locale` only decides how it is written. Pass
 * `getLocale()` on surfaces whose surrounding prose is translated — German writes
 * "12 $" and pt-BR "US$ 12", and a hardcoded "$12" beside a translated "12 $/Monat"
 * reads as two different prices. Defaults to en-US so app chrome is unaffected.
 */
export function formatUsdCents(cents: number, locale = "en-US"): string {
	const amount = cents / 100;
	const isWholeDollars = Number.isInteger(amount);

	return amount.toLocaleString(locale, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: isWholeDollars ? 0 : 2,
		maximumFractionDigits: isWholeDollars ? 0 : 2,
	});
}
