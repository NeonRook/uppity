/** Sweeps expired windows once this many keys are held. */
const SWEEP_THRESHOLD = 10_000;

/** Fixed-window attempt counter in process memory. Each web replica counts on its own. */
export class RateLimiter {
	#windows = new Map<string, { count: number; resetAt: number }>();

	constructor(
		private max: number,
		private windowMs: number,
	) {}

	/** Counts one attempt for `key`. False once the key has used up its window. */
	attempt(key: string, now = Date.now()): boolean {
		const current = this.#windows.get(key);
		if (current && current.resetAt > now) {
			current.count++;
			return current.count <= this.max;
		}

		if (this.#windows.size >= SWEEP_THRESHOLD) {
			for (const [k, w] of this.#windows) if (w.resetAt <= now) this.#windows.delete(k);
		}
		this.#windows.set(key, { count: 1, resetAt: now + this.windowMs });
		return true;
	}
}
