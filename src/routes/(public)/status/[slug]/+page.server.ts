import { error, fail } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import { TURNSTILE_RESPONSE_FIELD } from "#lib/constants/turnstile.js";
import { m } from "#lib/paraglide/messages.js";
import { subscribeSchema } from "#lib/schemas/status-page-subscriber.js";
import { clientAddress } from "#lib/server/client-ip.js";
import { RateLimiter } from "#lib/server/rate-limit.js";
import { statusPageSubscriberService } from "#lib/server/services/status-page-subscriber.instance.js";
import { statusPageService } from "#lib/server/services/status-page.service.js";
import { turnstileSiteKey, verifyTurnstile } from "#lib/server/turnstile.js";

import type { Actions, PageServerLoad } from "./$types";

/** Per client address and page. Each address is also throttled on its own by the service. */
const subscribeLimiter = new RateLimiter(10, 60 * 60_000);

export const load: PageServerLoad = async ({ params }) => {
	const data = await statusPageService.getPublicStatusPage(params.slug);

	if (!data) {
		error(404, "Status page not found");
	}

	const page = await statusPageService.findBySlug(params.slug);
	const accepting = page && (await statusPageSubscriberService.accepts(page.organizationId));

	return {
		statusData: data,
		subscribeForm: accepting ? await superValidate(valibot(subscribeSchema)) : null,
		turnstileSiteKey: turnstileSiteKey(),
	};
};

export const actions: Actions = {
	subscribe: async (event) => {
		const { params, request, locals } = event;
		const form = await superValidate(request.clone(), valibot(subscribeSchema));
		if (!form.valid) return fail(400, { form });

		const page = await statusPageService.findBySlug(params.slug);
		if (!page?.isPublic) error(404, "Status page not found");

		locals.event.merge({
			action: "subscribe_status_page",
			resource_type: "status_page",
			resource_id: page.id,
		});

		const rateLimited = () => message(form, m.public_subscribe_rate_limited(), { status: 429 });
		if (!subscribeLimiter.attempt(`${clientAddress(event) ?? "unknown"}:${page.id}`)) {
			return rateLimited();
		}

		// Ahead of the service, so the answer depends on the token alone and says nothing about
		// the address.
		const token = (await request.formData()).get(TURNSTILE_RESPONSE_FIELD);
		if (!(await verifyTurnstile(token, "subscribe"))) {
			return message(form, m.challenge_failed(), { status: 403 });
		}

		try {
			const result = await statusPageSubscriberService.subscribe(page, form.data.email);
			if (result === "paused") return message(form, m.public_subscribe_paused(), { status: 503 });
			if (result === "capped") {
				locals.event.set("confirmation_cap_reached", true);
				return rateLimited();
			}
		} catch (err) {
			locals.event.setError(err);
			return message(form, m.public_subscribe_failed(), { status: 500 });
		}
		return message(form, m.public_subscribe_sent());
	},
};
