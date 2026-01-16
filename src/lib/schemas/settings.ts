import * as v from "valibot";

export const updateProfileSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
});

export type UpdateProfileForm = v.InferInput<typeof updateProfileSchema>;

export const updateOrganizationSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1, "Organization name is required")),
});

export type UpdateOrganizationForm = v.InferInput<typeof updateOrganizationSchema>;

export const createOrganizationSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1, "Organization name is required")),
});

export type CreateOrganizationForm = v.InferInput<typeof createOrganizationSchema>;

export const inviteMemberSchema = v.object({
	email: v.pipe(v.string(), v.email("Valid email is required")),
	role: v.optional(v.picklist(["member", "admin", "owner"]), "member"),
});

export type InviteMemberForm = v.InferInput<typeof inviteMemberSchema>;

export const cancelInvitationSchema = v.object({
	invitationId: v.pipe(v.string(), v.minLength(1, "Invitation ID is required")),
});

export type CancelInvitationForm = v.InferInput<typeof cancelInvitationSchema>;

export const removeMemberSchema = v.object({
	memberId: v.pipe(v.string(), v.minLength(1, "Member ID is required")),
});

export type RemoveMemberForm = v.InferInput<typeof removeMemberSchema>;
