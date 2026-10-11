import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parsePage, toPage } from "./pagination";

const params = (query: string) => new URLSearchParams(query);

describe("parsePage", () => {
	it("defaults to the first page", () => {
		expect(parsePage(params(""))).toEqual({ limit: DEFAULT_PAGE_SIZE, after: null });
	});

	it("reads limit and cursor", () => {
		expect(parsePage(params("limit=10&cursor=mon-1"))).toEqual({ limit: 10, after: "mon-1" });
	});

	it("refuses a limit outside 1 to the maximum", () => {
		for (const limit of ["0", "-1", "1.5", "abc", "", String(MAX_PAGE_SIZE + 1)]) {
			expect(parsePage(params(`limit=${limit}`))).toMatch(/limit must be/);
		}
	});

	it("refuses an empty cursor", () => {
		expect(parsePage(params("cursor="))).toMatch(/cursor/);
	});
});

describe("toPage", () => {
	const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

	it("points the cursor at the last row returned when more exist", () => {
		expect(toPage(rows, 2)).toEqual({ data: rows.slice(0, 2), nextCursor: "b" });
	});

	it("has no cursor on the last page", () => {
		expect(toPage(rows, 3)).toEqual({ data: rows, nextCursor: null });
	});
});
