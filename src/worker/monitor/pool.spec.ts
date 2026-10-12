import { describe, expect, it } from "vitest";

import { SlotPool } from "./pool";

const never = () => new Promise<void>(() => {});

describe("SlotPool", () => {
	it("keeps starting fast tasks while one task never settles", async () => {
		const pool = new SlotPool(2);
		pool.start(never);

		let finished = 0;
		for (let i = 0; i < 5; i++) {
			await pool.slotFree();
			expect(pool.free).toBe(1);
			pool.start(async () => {
				finished++;
			});
		}
		await pool.slotFree();

		expect(finished).toBe(5);
	});

	it("waits for a slot when every slot is busy", async () => {
		const pool = new SlotPool(1);
		let release!: () => void;
		pool.start(() => new Promise<void>((resolve) => (release = resolve)));

		let freed = false;
		const waiting = pool.slotFree().then(() => (freed = true));
		await Promise.resolve();
		expect(freed).toBe(false);

		release();
		await waiting;
		expect(pool.free).toBe(1);
	});

	it("drains every started task", async () => {
		const pool = new SlotPool(3);
		const done: number[] = [];
		for (const ms of [5, 1, 3]) {
			pool.start(async () => {
				await new Promise((resolve) => setTimeout(resolve, ms));
				done.push(ms);
			});
		}

		await pool.drain();

		expect(done).toEqual([1, 3, 5]);
		expect(pool.free).toBe(3);
	});
});
