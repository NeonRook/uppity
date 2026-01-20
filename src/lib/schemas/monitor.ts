import {
	DEFAULT_TIMEOUT_SECONDS,
	DEFAULT_RETRIES,
	DEFAULT_ALERT_AFTER_FAILURES,
	DEFAULT_PUSH_GRACE_PERIOD_SECONDS,
	DEFAULT_HTTP_METHOD,
	MONITOR_INTERVAL,
} from "$lib/constants/defaults";
import * as v from "valibot";

const baseMonitorSchema = {
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
	description: v.optional(v.string()),
	intervalSeconds: v.optional(
		v.pipe(
			v.number(),
			v.minValue(
				MONITOR_INTERVAL.MIN_SECONDS,
				`Minimum interval is ${MONITOR_INTERVAL.MIN_SECONDS} seconds`,
			),
			v.maxValue(
				MONITOR_INTERVAL.MAX_SECONDS,
				`Maximum interval is ${MONITOR_INTERVAL.MAX_SECONDS} seconds`,
			),
		),
		MONITOR_INTERVAL.DEFAULT_SECONDS,
	),
	timeoutSeconds: v.optional(v.pipe(v.number(), v.minValue(1)), DEFAULT_TIMEOUT_SECONDS),
	retries: v.optional(v.pipe(v.number(), v.minValue(0)), DEFAULT_RETRIES),
	alertAfterFailures: v.optional(v.pipe(v.number(), v.minValue(1)), DEFAULT_ALERT_AFTER_FAILURES),
};

const httpMonitorSchema = v.object({
	...baseMonitorSchema,
	type: v.literal("http"),
	url: v.pipe(v.string(), v.url("Valid URL is required")),
	method: v.optional(
		v.picklist(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]),
		DEFAULT_HTTP_METHOD,
	),
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
	pushGracePeriodSeconds: v.optional(
		v.pipe(v.number(), v.minValue(0)),
		DEFAULT_PUSH_GRACE_PERIOD_SECONDS,
	),
});

export const createMonitorSchema = v.variant("type", [
	httpMonitorSchema,
	tcpMonitorSchema,
	pushMonitorSchema,
]);

export type CreateMonitorForm = v.InferInput<typeof createMonitorSchema>;
