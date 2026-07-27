import { AUDIT_PANEL_LIMIT } from "$lib/constants/audit";
import { updateOrganizationSchema, addMemberSchema } from "$lib/schemas/admin";
import { getActor } from "$lib/server/audit-actor";
import { getPlanFromSubscription, mapPolarStatus } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { adminService } from "$lib/server/services/admin.service";
import { auditService } from "$lib/server/services/audit.service";
import {
	isSelfHosted,
	subscriptionService,
	type PolarSubscriptionSnapshot,
} from "$lib/server/services/subscription.service";
import { Polar } from "@polar-sh/sdk";
import { error, fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

/**
 * Reads the live subscription from Polar.
 *
 * Lives here rather than in SubscriptionService so the Polar client and the
 * product-id mapping stay together with the rest of the Polar configuration.
 */
async function fetchPolarSnapshot(polarSubscriptionId: string): Promise<PolarSubscriptionSnapshot> {
	const client = new Polar({
		accessToken: process.env.POLAR_ACCESS_TOKEN,
		server: import.meta.env.DEV ? "sandbox" : "production",
	});

	const sub = await client.subscriptions.get({ id: polarSubscriptionId });

	return {
		planId: getPlanFromSubscription(sub),
		status: mapPolarStatus(sub.status),
		polarCustomerId: sub.customerId,
		polarSubscriptionId: sub.id,
		currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : undefined,
		currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined,
	};
}

export const load: PageServerLoad = async ({ params }) => {
	const org = await adminService.getOrganizationById(params.id);

	if (!org) {
		error(404, "Organization not found");
	}

	const form = await superValidate(
		{
			name: org.name,
			slug: org.slug,
			logo: org.logo || undefined,
		},
		valibot(updateOrganizationSchema),
	);

	const addMemberForm = await superValidate(valibot(addMemberSchema));

	// Get users not in this org for the add member dropdown
	const availableUsers = await adminService.getUsersNotInOrg(params.id);

	const selfHosted = isSelfHosted();
	const [subscription, plan, usage, limits] = await Promise.all([
		subscriptionService.getSubscription(params.id),
		subscriptionService.getOrganizationPlan(params.id),
		subscriptionService.getUsage(params.id),
		subscriptionService.getEffectiveLimits(params.id),
	]);

	const { entries: history } = await auditService.list({
		targetType: "organization",
		targetId: params.id,
		limit: AUDIT_PANEL_LIMIT,
	});

	return {
		org,
		form,
		addMemberForm,
		availableUsers,
		history,
		billing: { selfHosted, subscription, plan, usage, limits },
	};
};

export const actions: Actions = {
	update: async (event) => {
		const { request, params } = event;
		const form = await superValidate(request, valibot(updateOrganizationSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const actor = await getActor(event);
			await adminService.updateOrganization(actor, params.id, {
				name: form.data.name,
				slug: form.data.slug,
				logo: form.data.logo,
			});

			return { form, success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to update organization";
			return fail(400, { form, message });
		}
	},

	addMember: async (event) => {
		const { request, params } = event;
		const form = await superValidate(request, valibot(addMemberSchema));

		if (!form.valid) {
			return fail(400, { addMemberForm: form });
		}

		try {
			const actor = await getActor(event);
			await adminService.addMemberToOrg(
				actor,
				params.id,
				form.data.userId,
				form.data.role || "member",
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to add member";
			return fail(400, { addMemberForm: form, message });
		}

		return redirect(302, `/admin/organizations/${params.id}`);
	},

	removeMember: async (event) => {
		const { request, params } = event;
		const formData = await request.formData();
		const memberIdValue = formData.get("memberId");
		const memberId = typeof memberIdValue === "string" ? memberIdValue : "";

		if (!memberId) {
			return fail(400, { message: "Member ID is required" });
		}

		try {
			const actor = await getActor(event);
			await adminService.removeMemberFromOrg(actor, memberId);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to remove member";
			return fail(400, { message });
		}

		return redirect(302, `/admin/organizations/${params.id}`);
	},

	resyncSubscription: async (event) => {
		const { params } = event;

		if (isSelfHosted()) {
			return fail(400, { message: "Resync is unavailable in self-hosted mode" });
		}

		try {
			const before = await subscriptionService.getSubscription(params.id);
			if (!before?.polarSubscriptionId) {
				return fail(400, { message: "No Polar subscription on record for this organization" });
			}

			const snapshot = await fetchPolarSnapshot(before.polarSubscriptionId);
			const after = await subscriptionService.resyncFromPolar(params.id, snapshot);

			const actor = await getActor(event);
			await auditService.record(db, actor, {
				action: "org.subscription_resync",
				targetType: "subscription",
				targetId: after.id,
				targetLabel: params.id,
				metadata: {
					orgId: params.id,
					before: { planId: before.planId, status: before.status },
					after: { planId: after.planId, status: after.status },
				},
			});

			return { resynced: true };
		} catch (err) {
			// Surface the Polar error verbatim and leave the local row untouched.
			const message = err instanceof Error ? err.message : "Failed to resync from Polar";
			return fail(400, { message });
		}
	},
};
