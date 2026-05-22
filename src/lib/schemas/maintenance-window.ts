import * as v from "valibot";

const baseFields = {
	name: v.pipe(v.string(), v.trim(), v.minLength(1, "Name is required"), v.maxLength(200)),
	description: v.optional(v.pipe(v.string(), v.maxLength(2000))),
	startsAt: v.date(),
	endsAt: v.date(),
	monitorIds: v.pipe(v.array(v.string()), v.minLength(1, "Select at least one monitor")),
};

export const createMaintenanceWindowSchema = v.pipe(
	v.object(baseFields),
	v.check((data) => data.endsAt > data.startsAt, "End time must be after start time"),
);

export const updateMaintenanceWindowSchema = v.pipe(
	v.object(baseFields),
	v.check((data) => data.endsAt > data.startsAt, "End time must be after start time"),
);

export type CreateMaintenanceWindowFormData = v.InferOutput<typeof createMaintenanceWindowSchema>;
export type UpdateMaintenanceWindowFormData = v.InferOutput<typeof updateMaintenanceWindowSchema>;
