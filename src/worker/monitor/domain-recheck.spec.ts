import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { repeatInBackground } from "./domain-recheck";

describe("repeatInBackground", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("never overlaps a sweep and starts the next one after the wait", async () => {
		const finished = Promise.withResolvers<void>();
		const sweep = vi.fn(() => finished.promise);

		repeatInBackground(sweep, 1000);

		expect(sweep).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(5000);
		expect(sweep).toHaveBeenCalledOnce();

		finished.resolve();
		await vi.advanceTimersByTimeAsync(1000);
		expect(sweep).toHaveBeenCalledTimes(2);
	});
});
