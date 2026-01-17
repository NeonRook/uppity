import * as v from "valibot";

export const createUserSchema = v.object({
	email: v.pipe(v.string(), v.email("Valid email is required")),
	password: v.pipe(v.string(), v.minLength(8, "Password must be at least 8 characters")),
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
	role: v.optional(v.picklist(["user", "admin"]), "user"),
});

export type CreateUserForm = v.InferInput<typeof createUserSchema>;

export const updateUserSchema = v.object({
	name: v.optional(v.pipe(v.string(), v.minLength(1, "Name is required"))),
	email: v.optional(v.pipe(v.string(), v.email("Valid email is required"))),
	role: v.optional(v.picklist(["user", "admin"])),
	banned: v.optional(v.boolean()),
	banReason: v.optional(v.string()),
});

export type UpdateUserForm = v.InferInput<typeof updateUserSchema>;

export const createOrganizationSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
	slug: v.pipe(
		v.string(),
		v.minLength(1, "Slug is required"),
		v.regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
	),
	logo: v.optional(v.pipe(v.string(), v.url("Logo must be a valid URL"))),
});

export type CreateOrganizationForm = v.InferInput<typeof createOrganizationSchema>;

export const updateOrganizationSchema = v.object({
	name: v.optional(v.pipe(v.string(), v.minLength(1, "Name is required"))),
	slug: v.optional(
		v.pipe(
			v.string(),
			v.minLength(1, "Slug is required"),
			v.regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
		),
	),
	logo: v.optional(v.nullable(v.pipe(v.string(), v.url("Logo must be a valid URL")))),
});

export type UpdateOrganizationForm = v.InferInput<typeof updateOrganizationSchema>;

export const addMemberSchema = v.object({
	userId: v.pipe(v.string(), v.minLength(1, "User ID is required")),
	role: v.optional(v.picklist(["owner", "admin", "member"]), "member"),
});

export type AddMemberForm = v.InferInput<typeof addMemberSchema>;
