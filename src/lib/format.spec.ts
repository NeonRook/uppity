import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	generateSlug,
	formatDate,
	formatResponseTime,
	formatInterval,
	formatUptime,
	getRelativeTime,
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
