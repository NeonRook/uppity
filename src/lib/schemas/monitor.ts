import * as v from "valibot";

import {
	DEFAULT_TIMEOUT_SECONDS,
	DEFAULT_RETRIES,
	DEFAULT_ALERT_AFTER_FAILURES,
	DEFAULT_PUSH_GRACE_PERIOD_SECONDS,
	DEFAULT_HTTP_METHOD,
	MONITOR_INTERVAL,
} from "#lib/constants/defaults.js";
import {
	BODY_MATCH_MAX_LENGTH,
	HTTP_METHODS,
	MAX_RETRIES,
	MAX_TIMEOUT_SECONDS,
} from "#lib/constants/monitor.js";
import { m } from "#lib/paraglide/messages.js";
import { parseWebUrl } from "#lib/utils/web-url.js";

const channelLinkSchema = v.object({
	channelId: v.string(),
	notifyOnDown: v.boolean(),
	notifyOnUp: v.boolean(),
	notifyOnDegraded: v.boolean(),
	notifyOnSslExpiry: v.boolean(),
});

export type MonitorChannelLink = v.InferOutput<typeof channelLinkSchema>;

/** The events a channel hears about when it is first attached to a monitor. */
export function defaultChannelLink(channelId: string): MonitorChannelLink {
	return {
		channelId,
		notifyOnDown: true,
		notifyOnUp: true,
		notifyOnDegraded: false,
		notifyOnSslExpiry: true,
	};
}

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
	timeoutSeconds: v.optional(
		v.pipe(
			v.number(),
			v.minValue(1),
			v.maxValue(MAX_TIMEOUT_SECONDS, `Maximum timeout is ${MAX_TIMEOUT_SECONDS} seconds`),
		),
		DEFAULT_TIMEOUT_SECONDS,
	),
	retries: v.optional(
		v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_RETRIES, `Maximum retries is ${MAX_RETRIES}`)),
		DEFAULT_RETRIES,
	),
	alertAfterFailures: v.optional(v.pipe(v.number(), v.minValue(1)), DEFAULT_ALERT_AFTER_FAILURES),
	channels: v.optional(v.array(channelLinkSchema), []),
};

const httpMonitorSchema = v.object({
	...baseMonitorSchema,
	type: v.literal("http"),
	url: v.pipe(
		v.string(),
		v.url("Valid URL is required"),
		v.check(
			(url) => parseWebUrl(url) !== null,
			() => m.monitor_url_not_web(),
		),
	),
	method: v.optional(v.picklist(HTTP_METHODS), DEFAULT_HTTP_METHOD),
	sslCheckEnabled: v.optional(v.boolean(), false),
	expectedBodyContains: v.optional(
		v.pipe(
			v.string(),
			v.maxLength(BODY_MATCH_MAX_LENGTH, () =>
				m.monitor_body_contains_too_long({ max: BODY_MATCH_MAX_LENGTH }),
			),
		),
	),
	followRedirects: v.optional(v.boolean(), true),
	acceptSelfSigned: v.optional(v.boolean(), false),
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

export type MonitorFormData = v.InferOutput<typeof createMonitorSchema>;
