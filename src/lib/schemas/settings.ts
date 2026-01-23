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

export const updateOrganizationDetailsSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1, "Organization name is required")),
	slug: v.optional(
		v.pipe(
			v.string(),
			v.regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens allowed"),
		),
	),
	logo: v.optional(v.nullable(v.pipe(v.string(), v.url("Must be a valid URL")))),
	description: v.optional(v.pipe(v.string(), v.maxLength(500, "Maximum 500 characters"))),
});

export type UpdateOrganizationDetailsForm = v.InferInput<typeof updateOrganizationDetailsSchema>;

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
