import { fail, redirect, error } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import { m } from "#lib/paraglide/messages.js";
import {
	updateStatusPageSchema,
	claimDomainSchema,
	addMonitorSchema,
	removeMonitorSchema,
	createGroupSchema,
	deleteGroupSchema,
} from "#lib/schemas/status-page.js";
import { db } from "#lib/server/db/index.js";
import { FeatureNotAvailableError } from "#lib/server/errors.js";
import { RateLimiter } from "#lib/server/rate-limit.js";
import { monitorService } from "#lib/server/services/monitor.service.js";
import {
	domainTarget,
	findClaim,
	type VerifyResult,
} from "#lib/server/services/status-page-domain.service.js";
import { statusPageService } from "#lib/server/services/status-page.service.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";
import { toStatusPageInput } from "#lib/server/status-page-input.js";

import type { Actions, PageServerLoad } from "./$types";

/** Each check is two DNS lookups, so a held-down button must not become a flood of them. */
const domainCheckLimiter = new RateLimiter(10, 60_000);

const DOMAIN_NOTICES: Record<VerifyResult, () => string> = {
	verified: m.status_page_domain_verified,
	missing: m.status_page_domain_missing,
	unknown: m.status_page_domain_unknown,
	taken: m.status_page_domain_taken,
};

const domainRefused = (status: number, text: string) =>
	fail(status, { domainNotice: { ok: false, text } });

/** Runs a domain action for the signed-in organization, within the check limit. */
async function domainCheck(
	{ params, locals }: { params: { id: string }; locals: App.Locals },
	action: "claim_custom_domain" | "verify_custom_domain",
	check: (organizationId: string) => Promise<VerifyResult | null>,
) {
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) return domainRefused(401, "Not authenticated");

	locals.event.merge({ action, resource_type: "status_page", resource_id: params.id });

	if (!domainCheckLimiter.attempt(params.id)) {
		return domainRefused(429, m.status_page_domain_rate_limited());
	}
	try {
		const result = await check(organizationId);
		if (!result) return domainRefused(404, "Status page not found");
		return { domainNotice: { ok: result === "verified", text: DOMAIN_NOTICES[result]() } };
	} catch (err) {
		if (err instanceof FeatureNotAvailableError) return domainRefused(403, err.message);
		throw err;
	}
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const statusPage = await statusPageService.findByIdAndOrg(
		params.id,
		locals.session.activeOrganizationId,
	);

	if (!statusPage) {
		error(404, "Status page not found");
	}

	// Get all monitors for the organization
	const allMonitors = await monitorService.findByOrganization(locals.session.activeOrganizationId);

	// Get monitors currently on this status page
	const pageMonitors = await statusPageService.getMonitors(params.id);
	const selectedMonitorIds = pageMonitors.map((pm) => pm.monitor.id);

	// Get groups
	const groups = await statusPageService.getGroups(params.id);

	const claim = await findClaim(db, params.id);
	const { allowed } = await subscriptionService.areCustomDomainsAllowed(
		locals.session.activeOrganizationId,
	);

	// Initialize forms with current values
	const updateForm = await superValidate(
		{
			name: statusPage.name,
			slug: statusPage.slug,
			description: statusPage.description ?? undefined,
			isPublic: statusPage.isPublic,
			logoUrl: statusPage.logoUrl ?? undefined,
			primaryColor: statusPage.primaryColor ?? "#000000",
		},
		valibot(updateStatusPageSchema),
	);

	return {
		statusPage,
		allMonitors,
		selectedMonitorIds,
		groups,
		pageMonitors,
		updateForm,
		customDomain:
			claim || allowed
				? {
						claim: claim && { domain: claim.domain, token: claim.token },
						active: claim !== null && claim.domain === statusPage.customDomain,
						target: domainTarget(),
					}
				: null,
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(updateStatusPageSchema));

		if (!form.valid) {
			return fail(400, { updateForm: form });
		}

		const { data } = form;

		// Enrich wide event with action context
		locals.event.merge({
			action: "update_status_page",
			resource_type: "status_page",
			resource_id: params.id,
		});

		try {
			await statusPageService.update(
				params.id,
				locals.session.activeOrganizationId,
				toStatusPageInput(data),
			);

			return message(form, "Status page updated");
		} catch (err) {
			if (err instanceof Error && err.message === "Slug already taken") {
				return message(form, "This slug is already taken", { status: 400 });
			}
			locals.event.setError(err);
			return message(form, "Failed to update status page", { status: 500 });
		}
	},

	claimDomain: async (event) => {
		const form = await superValidate(event.request, valibot(claimDomainSchema));
		if (!form.valid) return domainRefused(400, m.status_page_domain_invalid());

		return domainCheck(event, "claim_custom_domain", (organizationId) =>
			statusPageService.claimDomain(event.params.id, organizationId, form.data.domain),
		);
	},

	verifyDomain: (event) =>
		domainCheck(event, "verify_custom_domain", (organizationId) =>
			statusPageService.verifyDomain(event.params.id, organizationId),
		),

	releaseDomain: async ({ params, locals }) => {
		if (!locals.session?.activeOrganizationId) return domainRefused(401, "Not authenticated");

		locals.event.merge({
			action: "release_custom_domain",
			resource_type: "status_page",
			resource_id: params.id,
		});
		await statusPageService.releaseDomain(params.id, locals.session.activeOrganizationId);
		return { domainNotice: { ok: true, text: m.status_page_domain_removed() } };
	},

	addMonitor: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(addMonitorSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const added = await statusPageService.addMonitor({
			statusPageId: params.id,
			organizationId: locals.session.activeOrganizationId,
			monitorId: form.data.monitorId,
		});

		if (!added) {
			return message(form, "Monitor not found", { status: 404 });
		}

		return message(form, "Monitor added");
	},

	removeMonitor: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(removeMonitorSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const removed = await statusPageService.removeMonitor(
			params.id,
			locals.session.activeOrganizationId,
			form.data.monitorId,
		);

		if (!removed) {
			return message(form, "Monitor not found", { status: 404 });
		}

		return message(form, "Monitor removed");
	},

	createGroup: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(createGroupSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const group = await statusPageService.createGroup({
			statusPageId: params.id,
			organizationId: locals.session.activeOrganizationId,
			name: form.data.groupName,
		});

		if (!group) {
			return message(form, "Status page not found", { status: 404 });
		}

		return message(form, "Group created");
	},

	deleteGroup: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(deleteGroupSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const deleted = await statusPageService.deleteGroup(
			params.id,
			locals.session.activeOrganizationId,
			form.data.groupId,
		);

		if (!deleted) {
			return message(form, "Group not found", { status: 404 });
		}

		return message(form, "Group deleted");
	},
};
