/**
 * A fixed number of slots for concurrent tasks. A slot frees as soon as its task
 * settles, so one slow task holds one slot rather than the whole worker.
 */
export class SlotPool {
	readonly #running = new Set<Promise<void>>();

	constructor(readonly size: number) {}

	get free(): number {
		return this.size - this.#running.size;
	}

	/** Starts `task` in a free slot. The task must handle its own errors. */
	start(task: () => Promise<void>): void {
		const running = task().finally(() => this.#running.delete(running));
		this.#running.add(running);
	}

	/** Resolves once at least one slot is free. */
	async slotFree(): Promise<void> {
		if (this.free === 0) await Promise.race(this.#running);
	}

	/** Resolves once every started task has settled. */
	async drain(): Promise<void> {
		await Promise.allSettled(this.#running);
	}
}
