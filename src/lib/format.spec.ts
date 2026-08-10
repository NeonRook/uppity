import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	generateSlug,
	dateToLocalInput,
	localInputToDate,
	formatDate,
	formatDateTimeRange,
	formatDuration,
	formatRelativeTime,
	formatResponseTime,
	formatInterval,
	formatUptime,
	formatUsdCents,
	getRelativeTime,
	getTimeZoneLabel,
	truncate,
} from "./format";

describe("generateSlug", () => {
	it("converts to lowercase", () => {
		expect(generateSlug("Hello World")).toBe("hello-world");
	});

	it("replaces spaces with hyphens", () => {
		expect(generateSlug("my status page")).toBe("my-status-page");
	});

	it("removes special characters", () => {
		expect(generateSlug("Hello! World@2024")).toBe("hello-world2024");
	});

	it("collapses multiple hyphens", () => {
		expect(generateSlug("hello---world")).toBe("hello-world");
	});

	it("handles mixed spaces and hyphens", () => {
		expect(generateSlug("hello - - world")).toBe("hello-world");
	});

	it("trims whitespace", () => {
		expect(generateSlug("  hello world  ")).toBe("hello-world");
	});

	it("handles empty string", () => {
		expect(generateSlug("")).toBe("");
	});

	it("handles string with only special characters", () => {
		expect(generateSlug("!@#$%")).toBe("");
	});

	it("preserves numbers", () => {
		expect(generateSlug("Status Page 2024")).toBe("status-page-2024");
	});

	it("handles unicode characters", () => {
		expect(generateSlug("Héllo Wörld")).toBe("hllo-wrld");
	});
});

describe("formatDate", () => {
	it("returns '-' for null", () => {
		expect(formatDate(null)).toBe("-");
	});

	it("formats a valid date", () => {
		const date = new Date("2024-01-15T10:30:00Z");
		const result = formatDate(date);
		// Just verify it returns a non-empty string (locale-dependent)
		expect(result).not.toBe("-");
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("formatResponseTime", () => {
	it("returns '-' for null", () => {
		expect(formatResponseTime(null)).toBe("-");
	});

	it("formats milliseconds correctly", () => {
		expect(formatResponseTime(0)).toBe("0ms");
		expect(formatResponseTime(123)).toBe("123ms");
		expect(formatResponseTime(5000)).toBe("5000ms");
	});
});

describe("formatInterval", () => {
	it("formats seconds", () => {
		expect(formatInterval(30)).toBe("30s");
		expect(formatInterval(59)).toBe("59s");
	});

	it("formats minutes", () => {
		expect(formatInterval(60)).toBe("1m");
		expect(formatInterval(120)).toBe("2m");
		expect(formatInterval(300)).toBe("5m");
		expect(formatInterval(3599)).toBe("59m");
	});

	it("formats hours", () => {
		expect(formatInterval(3600)).toBe("1h");
		expect(formatInterval(7200)).toBe("2h");
		expect(formatInterval(86400)).toBe("24h");
	});
});

describe("formatUptime", () => {
	it("returns '-' for null", () => {
		expect(formatUptime(null)).toBe("-");
	});

	it("formats uptime with one decimal place", () => {
		expect(formatUptime(100)).toBe("100.0%");
		expect(formatUptime(99.95)).toBe("100.0%");
		expect(formatUptime(99.94)).toBe("99.9%");
		expect(formatUptime(0)).toBe("0.0%");
	});
});

describe("getRelativeTime", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns 'Never' for null", () => {
		expect(getRelativeTime(null)).toBe("Never");
	});

	it("returns 'Just now' for very recent times", () => {
		const now = new Date("2024-01-15T12:00:00Z");
		expect(getRelativeTime(now)).toBe("Just now");
	});

	it("formats seconds ago", () => {
		const date = new Date("2024-01-15T11:59:30Z");
		expect(getRelativeTime(date)).toBe("30 seconds ago");
	});

	it("uses singular for 1 second", () => {
		const date = new Date("2024-01-15T11:59:59Z");
		expect(getRelativeTime(date)).toBe("1 second ago");
	});

	it("formats minutes ago", () => {
		const date = new Date("2024-01-15T11:55:00Z");
		expect(getRelativeTime(date)).toBe("5 minutes ago");
	});

	it("uses singular for 1 minute", () => {
		const date = new Date("2024-01-15T11:59:00Z");
		expect(getRelativeTime(date)).toBe("1 minute ago");
	});

	it("formats hours ago", () => {
		const date = new Date("2024-01-15T10:00:00Z");
		expect(getRelativeTime(date)).toBe("2 hours ago");
	});

	it("uses singular for 1 hour", () => {
		const date = new Date("2024-01-15T11:00:00Z");
		expect(getRelativeTime(date)).toBe("1 hour ago");
	});

	it("formats days ago", () => {
		const date = new Date("2024-01-12T12:00:00Z");
		expect(getRelativeTime(date)).toBe("3 days ago");
	});

	it("uses singular for 1 day", () => {
		const date = new Date("2024-01-14T12:00:00Z");
		expect(getRelativeTime(date)).toBe("1 day ago");
	});
});

describe("truncate", () => {
	it("returns string unchanged if shorter than maxLength", () => {
		expect(truncate("hello", 10)).toBe("hello");
	});

	it("returns string unchanged if equal to maxLength", () => {
		expect(truncate("hello", 5)).toBe("hello");
	});

	it("truncates and adds ellipsis for longer strings", () => {
		expect(truncate("hello world", 8)).toBe("hello...");
	});

	it("handles very short maxLength", () => {
		expect(truncate("hello world", 4)).toBe("h...");
	});

	it("handles empty string", () => {
		expect(truncate("", 10)).toBe("");
	});
});

describe("formatUsdCents", () => {
	it("omits cents for whole dollar amounts", () => {
		expect(formatUsdCents(1200)).toBe("$12");
	});

	it("groups thousands", () => {
		expect(formatUsdCents(299000)).toBe("$2,990");
	});

	it("shows cents when the amount is not whole", () => {
		// $2,990/year is $249.1666../month. Rendering it as "$249" understates the
		// real charge by $2 a year.
		expect(formatUsdCents(299000 / 12)).toBe("$249.17");
	});

	it("keeps an evenly divisible monthly equivalent clean", () => {
		expect(formatUsdCents(12000 / 12)).toBe("$10");
	});

	it("formats zero", () => {
		expect(formatUsdCents(0)).toBe("$0");
	});

	// Intl binds the amount to its symbol with U+00A0, which is what keeps a price
	// from wrapping across a line break. Spelled out so a plain space in an
	// expectation reads as the mistake it is rather than an invisible mismatch.
	it("writes the symbol where the locale puts it", () => {
		expect(formatUsdCents(1200, "de")).toBe("12\u00a0$");
	});

	it("keeps the currency USD regardless of locale", () => {
		expect(formatUsdCents(1200, "pt-br")).toBe("US$\u00a012");
	});

	it("uses the locale's decimal and grouping separators", () => {
		expect(formatUsdCents(299000 / 12, "de")).toBe("249,17\u00a0$");
	});
});

describe("formatDuration", () => {
	// Maintenance windows call this with (startsAt, endsAt) rather than an open-ended
	// incident, so the closed-interval behaviour is the one that matters here.
	it("formats a sub-hour window in minutes", () => {
		const start = new Date("2024-01-15T12:00:00Z");
		const end = new Date("2024-01-15T12:45:00Z");
		expect(formatDuration(start, end)).toBe("45m");
	});

	it("formats an hours-long window", () => {
		const start = new Date("2024-01-15T12:00:00Z");
		const end = new Date("2024-01-15T14:30:00Z");
		expect(formatDuration(start, end)).toBe("2h 30m");
	});

	it("formats a multi-day window", () => {
		const start = new Date("2024-01-15T12:00:00Z");
		const end = new Date("2024-01-17T17:00:00Z");
		expect(formatDuration(start, end)).toBe("2d 5h");
	});

	it("returns 0m for a zero-length span", () => {
		const at = new Date("2024-01-15T12:00:00Z");
		expect(formatDuration(at, at)).toBe("0m");
	});
});

describe("dateToLocalInput / localInputToDate", () => {
	it("renders local wall-clock time, not UTC", () => {
		// Built from local components, so this holds in any runner time zone — which is
		// the whole point of the helper.
		expect(dateToLocalInput(new Date(2024, 0, 15, 14, 30))).toBe("2024-01-15T14:30");
	});

	it("returns empty string for missing or unparseable input", () => {
		expect(dateToLocalInput(null)).toBe("");
		expect(dateToLocalInput(undefined)).toBe("");
		expect(dateToLocalInput("nope")).toBe("");
	});

	it("round-trips through the input value", () => {
		const original = new Date(2024, 5, 3, 9, 5);
		const parsed = localInputToDate(dateToLocalInput(original));
		expect(parsed?.getTime()).toBe(original.getTime());
	});

	it("returns null for an empty or unparseable control value", () => {
		expect(localInputToDate("")).toBeNull();
		expect(localInputToDate("nope")).toBeNull();
	});
});

describe("formatDateTimeRange", () => {
	// Dates are built from local components rather than parsed from a Z-suffixed
	// string, so these assertions do not shift with the runner's time zone.
	it("prints the date once when the window starts and ends the same day", () => {
		const start = new Date(2024, 0, 15, 14, 0);
		const end = new Date(2024, 0, 15, 16, 30);
		expect(formatDateTimeRange(start, end, "en-US")).toBe("Jan 15, 2:00 PM → 4:30 PM");
	});

	it("repeats the date when the window crosses midnight", () => {
		const start = new Date(2024, 0, 15, 22, 0);
		const end = new Date(2024, 0, 16, 2, 0);
		expect(formatDateTimeRange(start, end, "en-US")).toBe("Jan 15, 10:00 PM → Jan 16, 2:00 AM");
	});

	it("does not collapse same day-of-month in different months", () => {
		const start = new Date(2024, 0, 15, 14, 0);
		const end = new Date(2024, 1, 15, 16, 0);
		expect(formatDateTimeRange(start, end, "en-US")).toBe("Jan 15, 2:00 PM → Feb 15, 4:00 PM");
	});

	it("returns a dash when either end is unparseable", () => {
		expect(formatDateTimeRange("nope", new Date(2024, 0, 15), "en-US")).toBe("-");
		expect(formatDateTimeRange(new Date(2024, 0, 15), "nope", "en-US")).toBe("-");
	});
});

describe("formatRelativeTime", () => {
	const now = new Date("2024-01-15T12:00:00Z");

	it("looks forward, which is the common case for scheduled maintenance", () => {
		expect(formatRelativeTime(new Date("2024-01-15T15:00:00Z"), "en-US", now)).toBe("in 3 hours");
	});

	it("looks backward", () => {
		expect(formatRelativeTime(new Date("2024-01-12T12:00:00Z"), "en-US", now)).toBe("3 days ago");
	});

	it("uses the idiomatic word for a single day in either direction", () => {
		expect(formatRelativeTime(new Date("2024-01-16T12:00:00Z"), "en-US", now)).toBe("tomorrow");
		expect(formatRelativeTime(new Date("2024-01-14T12:00:00Z"), "en-US", now)).toBe("yesterday");
	});

	it("collapses anything under a minute to 'now'", () => {
		expect(formatRelativeTime(new Date("2024-01-15T12:00:30Z"), "en-US", now)).toBe("now");
	});

	it("picks the largest fitting unit", () => {
		expect(formatRelativeTime(new Date("2024-01-15T12:05:00Z"), "en-US", now)).toBe("in 5 minutes");
		expect(formatRelativeTime(new Date("2024-03-15T12:00:00Z"), "en-US", now)).toBe("in 2 months");
	});

	it("translates without a message key of its own", () => {
		expect(formatRelativeTime(new Date("2024-01-15T15:00:00Z"), "de", now)).toBe("in 3 Stunden");
		expect(formatRelativeTime(new Date("2024-01-15T15:00:00Z"), "pt-BR", now)).toBe("em 3 horas");
	});

	it("returns a dash for an unparseable date", () => {
		expect(formatRelativeTime("not a date", "en-US", now)).toBe("-");
	});
});

describe("getTimeZoneLabel", () => {
	it("names a zone rather than returning nothing", () => {
		expect(getTimeZoneLabel("en-US", new Date("2024-01-15T12:00:00Z"))).not.toBe("");
	});

	it("is stable for the same locale and instant", () => {
		const at = new Date("2024-01-15T12:00:00Z");
		expect(getTimeZoneLabel("en-US", at)).toBe(getTimeZoneLabel("en-US", at));
	});
});
