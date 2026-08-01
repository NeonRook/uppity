import { LANDING_STATUS_PAGE_SLUG } from "$lib/constants/defaults";
import { statusPageService, type FeaturedUptime } from "$lib/server/services/status-page.service";
import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

/**
 * The front door ships no JavaScript. Nothing here holds client state: every
 * control is an `<a>`, both comparison tables are static markup, and the one
 * authored motion — the chart's draw — runs from an inline observer rather
 * than from hydration. Booting Svelte, the SvelteKit router, and tailwind-merge
 * to animate one path cost 87 KB gzipped and 242 ms of blocking time on a
 * throttled phone, against a page that is already complete when it arrives.
 *
 * The trade is that links leave this page as full navigations. That costs
 * nothing real: every destination boots the app bundle on arrival anyway.
 */
export const csr = false;

/**
 * The featured band aggregates ninety days of checks, and `/` is the busiest
 * anonymous route in the product. A day's cells change at most once a day, so
 * a few minutes of staleness costs nothing and keeps the front door cheap.
 *
 * Held in process rather than announced through `cache-control`: this route
 * redirects authenticated visitors, so a shared cache in front of it would be
 * choosing between caching a 302 and serving a 200 to the wrong audience.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: FeaturedUptime | null } | null = null;

async function featuredUptime(): Promise<FeaturedUptime | null> {
	if (!LANDING_STATUS_PAGE_SLUG) {
		return null;
	}

	if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
		return cached.value;
	}

	try {
		// A missing page is cached too: a misconfigured slug should not re-query
		// on every anonymous request.
		const value = await statusPageService.getFeaturedUptime(LANDING_STATUS_PAGE_SLUG);
		cached = { at: Date.now(), value };
		return value;
	} catch {
		// The front door is not where a database problem should surface. Fall back
		// to the link-only section, and leave the cache untouched so the next
		// request retries rather than inheriting the failure.
		return cached?.value ?? null;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, "/dashboard");
	}

	return { featuredUptime: await featuredUptime() };
};
