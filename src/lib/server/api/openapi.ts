import { API_KEY_PREFIX, API_KEYS_PER_ORGANIZATION } from "#lib/constants/api.js";
import { FREE_PLAN, UPPITY_PLAN } from "#lib/constants/plans.js";
import { INCIDENT_STATUSES } from "#lib/constants/status.js";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./pagination";

const free = FREE_PLAN.limits.apiRequestsPerMinute;
const paid = UPPITY_PLAN.limits.apiRequestsPerMinute;

// The limiter resets a key's count only after a full minute with no accepted request,
// so the figure is a burst size, not a per-minute rate. See ADR 0006.
const description = `Read-only access to an organization's monitors, incidents and status pages.

Authenticate with an API key from Settings → API keys: \`Authorization: Bearer ${API_KEY_PREFIX}…\`. An organization can hold ${API_KEYS_PER_ORGANIZATION} keys.

**Rate limits.** Each key can make ${free} requests on the Free plan, or ${paid} on paid plans, before it has to pause. The count resets once the key has gone a full minute without an accepted request, so a client that polls steadily reaches the limit even below ${free} requests a minute. A refused request returns \`429\` with \`Retry-After\` in seconds. Self-hosted operators set the figure with \`UPPITY_API_REQUESTS_PER_MINUTE\`.

**Pagination.** List endpoints return \`{ data, nextCursor }\`, newest first. Pass \`nextCursor\` back as \`cursor\` for the next page; it is \`null\` on the last one.

**Public summaries.** \`/status-pages/{id}/summary\` needs no key and allows any origin. It returns what the public status page shows, or \`404\` when the page is private.

**Errors** share one shape: \`{ "error": { "code", "message" } }\`.`;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (type: string, extra: object = {}) => ({ type: [type, "null"], ...extra });
const dateTime = { type: "string", format: "date-time" };
const json = (schema: object) => ({ content: { "application/json": { schema } } });

const overallStatus = {
	enum: [
		"operational",
		"degraded",
		"partial_outage",
		"major_outage",
		"unmonitored",
		"under_maintenance",
	],
	description: "`unmonitored` means at least one component's status is unknown.",
};
const componentStatus = {
	enum: ["up", "down", "degraded", "unknown", "maintenance"],
	description:
		"`unknown` covers a monitor that has never been checked and one whose checks are failing or overdue.",
};

const pageParams = [
	{
		name: "limit",
		in: "query",
		schema: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE },
	},
	{ name: "cursor", in: "query", schema: { type: "string" } },
];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };

const page = (item: string) =>
	json({
		type: "object",
		required: ["data", "nextCursor"],
		properties: { data: { type: "array", items: ref(item) }, nextCursor: nullable("string") },
	});

const errors = (...statuses: number[]) =>
	Object.fromEntries(
		statuses.map((status) => [status, { $ref: `#/components/responses/${status}` }]),
	);

const get = (summary: string, ok: object, parameters: object[], ...errorStatuses: number[]) => ({
	get: {
		summary,
		parameters,
		responses: { 200: { description: "OK", ...ok }, ...errors(401, 403, 429, ...errorStatuses) },
	},
});

const errorResponse = (summary: string) => ({
	description: summary,
	...json(ref("Error")),
});

export const openApiDocument = {
	openapi: "3.1.0",
	info: { title: "Uppity API", version: "1", description },
	servers: [{ url: "/api/v1" }],
	security: [{ apiKey: [] }],
	paths: {
		"/monitors": get("List monitors", page("Monitor"), pageParams, 400),
		"/monitors/{id}": get("Get a monitor", json(ref("Monitor")), [idParam], 404),
		"/monitors/{id}/checks": get(
			"List a monitor's checks",
			page("Check"),
			[idParam, ...pageParams],
			400,
			404,
		),
		"/incidents": get("List incidents, resolved included", page("Incident"), pageParams, 400),
		"/incidents/{id}": get("Get an incident", json(ref("IncidentDetail")), [idParam], 404),
		"/status-pages": get(
			"List status pages, private included",
			page("StatusPage"),
			pageParams,
			400,
		),
		"/status-pages/{id}": get(
			"Get a status page with its components' current status",
			json(ref("StatusPageDetail")),
			[idParam],
			404,
		),
		"/status-pages/{id}/summary": {
			get: {
				summary: "Get what a public status page shows",
				security: [],
				parameters: [idParam],
				responses: {
					200: { description: "OK", ...json(ref("StatusPageSummary")) },
					404: errorResponse("No public status page with that id"),
				},
			},
		},
	},
	components: {
		securitySchemes: { apiKey: { type: "http", scheme: "bearer" } },
		responses: {
			400: errorResponse("Invalid limit or cursor"),
			401: errorResponse("Missing, invalid, expired or revoked key"),
			403: errorResponse("The plan does not allow this request"),
			404: errorResponse("No such resource in this organization"),
			429: {
				...errorResponse("Rate limited"),
				headers: { "Retry-After": { schema: { type: "integer" } } },
			},
		},
		schemas: {
			Error: {
				type: "object",
				properties: {
					error: {
						type: "object",
						properties: { code: { type: "string" }, message: { type: "string" } },
					},
				},
			},
			Monitor: {
				type: "object",
				properties: {
					id: { type: "string" },
					name: { type: "string" },
					description: nullable("string"),
					type: { enum: ["http", "tcp", "push"] },
					active: { type: "boolean" },
					pausedForCapacity: { type: "boolean" },
					status: {
						enum: ["up", "down", "degraded", "unknown", "not_checked"],
						description:
							"`not_checked` means Uppity's own checks of this monitor are failing or overdue, so the last recorded status is stale.",
					},
					url: nullable("string", {
						description:
							"Credentials, fragment, query values, matrix parameters and unusual query names are removed: `?token=abc` reads `?token=***`. Host and path are returned as stored. Null when the stored URL is not a valid http or https address.",
					}),
					method: nullable("string"),
					hostname: nullable("string"),
					port: nullable("integer"),
					intervalSeconds: { type: "integer" },
					timeoutSeconds: { type: "integer" },
					lastCheckAt: nullable("string", { format: "date-time" }),
					uptimePercent24h: nullable("number"),
					avgResponseTimeMs24h: nullable("integer"),
					createdAt: dateTime,
					updatedAt: dateTime,
				},
			},
			Check: {
				type: "object",
				properties: {
					id: { type: "string" },
					status: { enum: ["up", "down", "degraded"] },
					statusCode: nullable("integer"),
					responseTimeMs: nullable("integer"),
					errorMessage: nullable("string"),
					sslExpiresAt: nullable("string", { format: "date-time" }),
					checkedAt: dateTime,
				},
			},
			Incident: {
				type: "object",
				properties: {
					id: { type: "string" },
					title: { type: "string" },
					status: { enum: INCIDENT_STATUSES },
					impact: { enum: ["none", "minor", "major", "critical"] },
					autoCreated: { type: "boolean" },
					startedAt: dateTime,
					resolvedAt: nullable("string", { format: "date-time" }),
					createdAt: dateTime,
					updatedAt: dateTime,
				},
			},
			IncidentDetail: {
				allOf: [
					ref("Incident"),
					{
						type: "object",
						properties: {
							updates: {
								type: "array",
								items: {
									type: "object",
									properties: {
										id: { type: "string" },
										status: { type: "string" },
										message: { type: "string" },
										createdAt: dateTime,
									},
								},
							},
							affectedMonitors: {
								type: "array",
								items: {
									type: "object",
									properties: { id: { type: "string" }, name: { type: "string" } },
								},
							},
						},
					},
				],
			},
			StatusPage: {
				type: "object",
				properties: {
					id: { type: "string" },
					name: { type: "string" },
					slug: { type: "string" },
					description: nullable("string"),
					isPublic: { type: "boolean" },
					customDomain: nullable("string"),
					createdAt: dateTime,
					updatedAt: dateTime,
				},
			},
			StatusPageDetail: {
				allOf: [
					ref("StatusPage"),
					{
						type: "object",
						properties: {
							overallStatus,
							groups: {
								type: "array",
								items: {
									type: "object",
									properties: { id: { type: "string" }, name: { type: "string" } },
								},
							},
							components: {
								type: "array",
								items: {
									type: "object",
									properties: {
										id: { type: "string" },
										monitorId: { type: "string" },
										name: { type: "string" },
										groupId: nullable("string"),
										status: componentStatus,
									},
								},
							},
						},
					},
				],
			},
			StatusPageSummary: {
				type: "object",
				description:
					"Component ids belong to the page and do not reveal monitor ids. Daily history covers the last 90 UTC days.",
				properties: {
					page: {
						type: "object",
						properties: {
							name: { type: "string" },
							slug: { type: "string" },
							description: nullable("string"),
							logoUrl: nullable("string"),
							faviconUrl: nullable("string"),
						},
					},
					overallStatus,
					groups: {
						type: "array",
						items: {
							type: "object",
							properties: {
								id: { type: "string" },
								name: { type: "string" },
								description: nullable("string"),
								isCollapsed: { type: "boolean" },
								monitors: { type: "array", items: ref("SummaryComponent") },
							},
						},
					},
					ungroupedMonitors: { type: "array", items: ref("SummaryComponent") },
					activeIncidents: { type: "array", items: ref("SummaryIncident") },
					resolvedIncidents: { type: "array", items: ref("SummaryIncident") },
					activeMaintenance: { type: "array", items: ref("SummaryMaintenance") },
					upcomingMaintenance: { type: "array", items: ref("SummaryMaintenance") },
				},
			},
			SummaryComponent: {
				type: "object",
				properties: {
					id: { type: "string" },
					name: { type: "string" },
					description: nullable("string"),
					status: componentStatus,
					uptimePercent90d: nullable("number"),
					dailyHistory: {
						type: "array",
						items: {
							type: "object",
							properties: {
								date: { type: "string", format: "date" },
								status: { enum: ["up", "down", "degraded", "partial", "unknown"] },
								uptimePercent: nullable("number"),
							},
						},
					},
				},
			},
			SummaryIncident: {
				type: "object",
				properties: {
					id: { type: "string" },
					title: { type: "string" },
					status: { enum: INCIDENT_STATUSES },
					impact: { enum: ["none", "minor", "major", "critical"] },
					createdAt: dateTime,
					startedAt: dateTime,
					resolvedAt: nullable("string", { format: "date-time" }),
					updates: {
						type: "array",
						items: {
							type: "object",
							properties: {
								id: { type: "string" },
								status: { type: "string" },
								message: { type: "string" },
								createdAt: dateTime,
							},
						},
					},
				},
			},
			SummaryMaintenance: {
				type: "object",
				properties: {
					id: { type: "string" },
					name: { type: "string" },
					description: nullable("string"),
					startsAt: dateTime,
					endsAt: dateTime,
				},
			},
		},
	},
};
