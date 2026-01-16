import * as v from "valibot";

export const incidentStatusValues = [
	"investigating",
	"identified",
	"monitoring",
	"resolved",
] as const;
export const incidentImpactValues = ["none", "minor", "major", "critical"] as const;

export const createIncidentSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1, "Title is required")),
	status: v.picklist(incidentStatusValues, "Invalid status"),
	impact: v.picklist(incidentImpactValues, "Invalid impact level"),
	message: v.pipe(v.string(), v.minLength(1, "Initial update message is required")),
	monitors: v.optional(v.array(v.string())),
});

export type CreateIncidentForm = v.InferInput<typeof createIncidentSchema>;

export const updateIncidentSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1, "Title is required")),
	impact: v.picklist(incidentImpactValues, "Invalid impact level"),
});

export type UpdateIncidentForm = v.InferInput<typeof updateIncidentSchema>;

export const addIncidentUpdateSchema = v.object({
	status: v.picklist(incidentStatusValues, "Invalid status"),
	message: v.pipe(v.string(), v.minLength(1, "Update message is required")),
});

export type AddIncidentUpdateForm = v.InferInput<typeof addIncidentUpdateSchema>;

export const deleteIncidentSchema = v.object({
	incidentId: v.pipe(v.string(), v.minLength(1, "Incident ID is required")),
});

export type DeleteIncidentForm = v.InferInput<typeof deleteIncidentSchema>;
