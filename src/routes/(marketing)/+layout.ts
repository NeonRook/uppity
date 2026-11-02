/**
 * The marketing pages ship no JavaScript. Nothing here holds client state: every
 * control is an `<a>`, every table is static markup, and the one
 * authored motion — the chart's draw — runs from an inline observer rather
 * than from hydration. Booting Svelte, the SvelteKit router, and tailwind-merge
 * to animate one path cost 87 KB gzipped and 242 ms of blocking time on a
 * throttled phone, against pages that are already complete when they arrive.
 *
 * The trade is that links leave these pages as full navigations. That costs
 * nothing real: every destination boots the app bundle on arrival anyway.
 */
export const csr = false;
