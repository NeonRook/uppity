import * as v from "valibot";

export const createStatusPageSchema = v.object({
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
	monitors: v.optional(v.array(v.string())),
});

export type CreateStatusPageForm = v.InferInput<typeof createStatusPageSchema>;

export const updateStatusPageSchema = v.object({
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
});

export type UpdateStatusPageForm = v.InferInput<typeof updateStatusPageSchema>;

export const addMonitorSchema = v.object({
	monitorId: v.pipe(v.string(), v.minLength(1, "Monitor ID is required")),
});

export type AddMonitorForm = v.InferInput<typeof addMonitorSchema>;

export const removeMonitorSchema = v.object({
	monitorId: v.pipe(v.string(), v.minLength(1, "Monitor ID is required")),
});

export type RemoveMonitorForm = v.InferInput<typeof removeMonitorSchema>;

export const reorderMonitorSchema = v.object({
	monitorId: v.pipe(v.string(), v.minLength(1, "Monitor ID is required")),
	direction: v.picklist(["up", "down"], "Direction must be up or down"),
});

export type ReorderMonitorForm = v.InferInput<typeof reorderMonitorSchema>;

export const createGroupSchema = v.object({
	groupName: v.pipe(v.string(), v.minLength(1, "Group name is required")),
});

export type CreateGroupForm = v.InferInput<typeof createGroupSchema>;

export const deleteGroupSchema = v.object({
	groupId: v.pipe(v.string(), v.minLength(1, "Group ID is required")),
});

export type DeleteGroupForm = v.InferInput<typeof deleteGroupSchema>;

// List page actions
export const deleteStatusPageSchema = v.object({
	statusPageId: v.pipe(v.string(), v.minLength(1, "Status page ID is required")),
});

export type DeleteStatusPageForm = v.InferInput<typeof deleteStatusPageSchema>;
