import { updateOrganizationSchema, addMemberSchema } from "$lib/schemas/admin";
import { getActor } from "$lib/server/audit-actor";
import { adminService } from "$lib/server/services/admin.service";
import { error, fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

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

	return { org, form, addMemberForm, availableUsers };
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
};
