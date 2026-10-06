import * as v from "valibot";

export const maintenanceWindowSchema = v.pipe(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.minLength(1, "Name is required"), v.maxLength(200)),
		description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000))),
		startsAt: v.date(),
		endsAt: v.date(),
		monitorIds: v.pipe(v.array(v.string()), v.minLength(1, "Select at least one monitor")),
	}),
	v.check((data) => data.endsAt > data.startsAt, "End time must be after start time"),
);

export const createMaintenanceWindowSchema = maintenanceWindowSchema;
export const updateMaintenanceWindowSchema = maintenanceWindowSchema;
