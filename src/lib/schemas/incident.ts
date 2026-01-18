import { INCIDENT_IMPACTS, INCIDENT_STATUS_VALUES } from "$lib/constants/status";
import * as v from "valibot";

export const createIncidentSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1, "Title is required")),
	status: v.picklist(INCIDENT_STATUS_VALUES, "Invalid status"),
	impact: v.picklist(INCIDENT_IMPACTS, "Invalid impact level"),
	message: v.pipe(v.string(), v.minLength(1, "Initial update message is required")),
	monitors: v.optional(v.array(v.string())),
});

export type CreateIncidentForm = v.InferInput<typeof createIncidentSchema>;

export const updateIncidentSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1, "Title is required")),
	impact: v.picklist(INCIDENT_IMPACTS, "Invalid impact level"),
});

export type UpdateIncidentForm = v.InferInput<typeof updateIncidentSchema>;

export const addIncidentUpdateSchema = v.object({
	status: v.picklist(INCIDENT_STATUS_VALUES, "Invalid status"),
	message: v.pipe(v.string(), v.minLength(1, "Update message is required")),
});

export type AddIncidentUpdateForm = v.InferInput<typeof addIncidentUpdateSchema>;

export const addPostmortemSchema = v.object({
	message: v.pipe(v.string(), v.minLength(1, "Postmortem content is required")),
});

export type AddPostmortemForm = v.InferInput<typeof addPostmortemSchema>;

export const editPostmortemSchema = v.object({
	updateId: v.pipe(v.string(), v.minLength(1, "Update ID is required")),
	message: v.pipe(v.string(), v.minLength(1, "Postmortem content is required")),
});

export type EditPostmortemForm = v.InferInput<typeof editPostmortemSchema>;

export const deleteIncidentSchema = v.object({
	incidentId: v.pipe(v.string(), v.minLength(1, "Incident ID is required")),
});

export type DeleteIncidentForm = v.InferInput<typeof deleteIncidentSchema>;
