import * as v from "valibot";

const statusPageFields = {
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
	slug: v.pipe(
		v.string(),
		v.minLength(1, "Slug is required"),
		v.regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
	),
	description: v.optional(v.string()),
	isPublic: v.optional(v.boolean(), false),
	logoUrl: v.optional(v.string()),
	primaryColor: v.optional(v.string(), "#000000"),
};

export const createStatusPageSchema = v.object({
	...statusPageFields,
	monitors: v.optional(v.array(v.string())),
});

export const updateStatusPageSchema = v.object(statusPageFields);

export const addMonitorSchema = v.object({
	monitorId: v.pipe(v.string(), v.minLength(1, "Monitor ID is required")),
});

export const removeMonitorSchema = v.object({
	monitorId: v.pipe(v.string(), v.minLength(1, "Monitor ID is required")),
});

export const createGroupSchema = v.object({
	groupName: v.pipe(v.string(), v.minLength(1, "Group name is required")),
});

export const deleteGroupSchema = v.object({
	groupId: v.pipe(v.string(), v.minLength(1, "Group ID is required")),
});
