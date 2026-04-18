import { describe, it, expect, vi, type Mock } from "vitest";

import { claimPendingEvents, processOne } from "./processor";

function makeMockDb(overrides?: {
	selectResult?: unknown[];
	transactionImpl?: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
	updateImpl?: Mock;
}) {
	const updateMock =
		overrides?.updateImpl ??
		vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});

	return {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(overrides?.selectResult ?? []),
				}),
			}),
		}),
		update: updateMock,
		transaction:
			overrides?.transactionImpl ??
			((fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockReturnValue({
										for: vi.fn().mockResolvedValue([]),
									}),
								}),
							}),
						}),
					}),
					update: updateMock,
				})),
	} as never;
}

describe("claimPendingEvents", () => {
	it("returns empty array when no rows available", async () => {
		const db = makeMockDb();
		const result = await claimPendingEvents(db);
		expect(result).toEqual([]);
	});

	it("claims rows and marks them processing", async () => {
		const updateMock = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});

		const db = makeMockDb({
			transactionImpl: (fn) =>
				fn({
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockReturnValue({
										for: vi.fn().mockResolvedValue([{ id: "e1" }, { id: "e2" }]),
									}),
								}),
							}),
						}),
					}),
					update: updateMock,
				}),
			updateImpl: updateMock,
		});

		const result = await claimPendingEvents(db);
		expect(result).toEqual(["e1", "e2"]);
		expect(updateMock).toHaveBeenCalled();
	});

	it("uses FOR UPDATE SKIP LOCKED", async () => {
		const forSpy = vi.fn().mockResolvedValue([]);
		const db = makeMockDb({
			transactionImpl: (fn) =>
				fn({
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockReturnValue({ for: forSpy }),
								}),
							}),
						}),
					}),
					update: vi.fn(),
				}),
		});

		await claimPendingEvents(db);
		expect(forSpy).toHaveBeenCalledWith("update", { skipLocked: true });
	});
});

describe("processOne", () => {
	it("marks pending row as processed", async () => {
		const updateMock = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});
		const db = makeMockDb({
			selectResult: [
				{
					id: "e1",
					organizationId: "org-1",
					monitorId: "m-1",
					incidentId: null,
					type: "monitor_down",
					status: "pending",
					payload: {},
					claimedAt: new Date(),
					processedAt: null,
					errorMessage: null,
					createdAt: new Date(),
				},
			],
			updateImpl: updateMock,
		});

		await processOne(db, "e1");
		expect(updateMock).toHaveBeenCalled();
	});

	it("no-ops for already-processed row", async () => {
		const updateMock = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});
		const db = makeMockDb({
			selectResult: [
				{
					id: "e1",
					organizationId: "org-1",
					monitorId: "m-1",
					incidentId: null,
					type: "monitor_down",
					status: "processed",
					payload: {},
					claimedAt: new Date(),
					processedAt: new Date(),
					errorMessage: null,
					createdAt: new Date(),
				},
			],
			updateImpl: updateMock,
		});

		await processOne(db, "e1");
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("no-ops for missing row", async () => {
		const updateMock = vi.fn();
		const db = makeMockDb({ selectResult: [], updateImpl: updateMock });
		await processOne(db, "missing");
		expect(updateMock).not.toHaveBeenCalled();
	});
});
