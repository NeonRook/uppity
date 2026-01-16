import * as v from "valibot";

const baseMonitorSchema = {
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
	description: v.optional(v.string()),
	intervalSeconds: v.optional(v.pipe(v.number(), v.minValue(10)), 60),
	timeoutSeconds: v.optional(v.pipe(v.number(), v.minValue(1)), 30),
	retries: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
	alertAfterFailures: v.optional(v.pipe(v.number(), v.minValue(1)), 1),
};

const httpMonitorSchema = v.object({
	...baseMonitorSchema,
	type: v.literal("http"),
	url: v.pipe(v.string(), v.url("Valid URL is required")),
	method: v.optional(v.picklist(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]), "GET"),
	sslCheckEnabled: v.optional(v.boolean(), false),
});

const tcpMonitorSchema = v.object({
	...baseMonitorSchema,
	type: v.literal("tcp"),
	hostname: v.pipe(v.string(), v.minLength(1, "Hostname is required")),
	port: v.pipe(v.number(), v.minValue(1, "Port is required"), v.maxValue(65535)),
});

const pushMonitorSchema = v.object({
	...baseMonitorSchema,
	type: v.literal("push"),
	pushGracePeriodSeconds: v.optional(v.pipe(v.number(), v.minValue(0)), 60),
});

export const createMonitorSchema = v.variant("type", [
	httpMonitorSchema,
	tcpMonitorSchema,
	pushMonitorSchema,
]);

export type CreateMonitorForm = v.InferInput<typeof createMonitorSchema>;
