import { relations, sql } from "drizzle-orm";
import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	jsonb,
	real,
	primaryKey,
	index,
	uniqueIndex,
	foreignKey,
} from "drizzle-orm/pg-core";

// Import auth tables for foreign key references
import { user, organization, member, invitation } from "./auth-schema";

// ============================================================================
// MONITOR TABLES
// ============================================================================

export const monitor = pgTable(
	"monitor",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		type: text("type").notNull().default("http"), // 'http' | 'tcp' | 'push'
		active: boolean("active").notNull().default(true),

		// HTTP specific
		url: text("url"),
		method: text("method").default("GET"),
		headers: jsonb("headers").$type<Record<string, string>>(),
		body: text("body"),
		expectedStatusCodes: jsonb("expected_status_codes").$type<number[]>().default([200]),
		expectedBodyContains: text("expected_body_contains"),

		// TCP specific
		hostname: text("hostname"),
		port: integer("port"),

		// Push specific
		pushToken: text("push_token").unique(),
		pushGracePeriodSeconds: integer("push_grace_period_seconds").default(60),

		// Timing
		intervalSeconds: integer("interval_seconds").notNull().default(60),
		timeoutSeconds: integer("timeout_seconds").notNull().default(30),
		retries: integer("retries").notNull().default(0),

		// SSL
		sslCheckEnabled: boolean("ssl_check_enabled").notNull().default(true),
		sslExpiryThresholdDays: integer("ssl_expiry_threshold_days").default(14),

		// Alerting
		alertAfterFailures: integer("alert_after_failures").notNull().default(1),

		// Metadata
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),

		// Scheduler columns (worker polling)
		nextCheckAt: timestamp("next_check_at", { withTimezone: true }).default(sql`NOW()`),
		checkRetryCount: integer("check_retry_count").default(0),
		checkLastError: text("check_last_error"),
		checkBackoffUntil: timestamp("check_backoff_until", { withTimezone: true }),
	},
	(table) => [
		index("monitor_org_idx").on(table.organizationId),
		// Partial index for worker polling queries (only active monitors)
		index("idx_monitor_due_checks")
			.on(table.nextCheckAt)
			.where(sql`${table.active} = true`),
	],
);

export const monitorCheck = pgTable(
	"monitor_check",
	{
		id: text("id").primaryKey(),
		monitorId: text("monitor_id")
			.notNull()
			.references(() => monitor.id, { onDelete: "cascade" }),
		status: text("status").notNull(), // 'up' | 'down' | 'degraded'
		statusCode: integer("status_code"),
		responseTimeMs: integer("response_time_ms"),
		errorMessage: text("error_message"),

		// SSL info
		sslExpiresAt: timestamp("ssl_expires_at"),
		sslIssuer: text("ssl_issuer"),

		// Metadata
		checkedAt: timestamp("checked_at").notNull().defaultNow(),
		region: text("region").default("default"),
	},
	(table) => [
		index("monitor_check_monitor_idx").on(table.monitorId),
		index("monitor_check_checked_at_idx").on(table.checkedAt),
	],
);

export const monitorStatus = pgTable(
	"monitor_status",
	{
		monitorId: text("monitor_id")
			.primaryKey()
			.references(() => monitor.id, { onDelete: "cascade" }),
		status: text("status").notNull().default("unknown"), // 'up' | 'down' | 'degraded' | 'unknown'
		lastCheckAt: timestamp("last_check_at"),
		lastStatusChange: timestamp("last_status_change"),
		consecutiveFailures: integer("consecutive_failures").notNull().default(0),
		uptimePercent24h: real("uptime_percent_24h"),
		avgResponseTimeMs24h: integer("avg_response_time_ms_24h"),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [index("monitor_status_status_idx").on(table.status)],
);

export const monitorDailyStats = pgTable(
	"monitor_daily_stats",
	{
		id: text("id").primaryKey(),
		monitorId: text("monitor_id")
			.notNull()
			.references(() => monitor.id, { onDelete: "cascade" }),
		date: timestamp("date").notNull(),
		totalChecks: integer("total_checks").notNull().default(0),
		successfulChecks: integer("successful_checks").notNull().default(0),
		failedChecks: integer("failed_checks").notNull().default(0),
		avgResponseTimeMs: integer("avg_response_time_ms"),
		minResponseTimeMs: integer("min_response_time_ms"),
		maxResponseTimeMs: integer("max_response_time_ms"),
		uptimePercent: real("uptime_percent"),
		incidentCount: integer("incident_count").notNull().default(0),
	},
	(table) => [
		uniqueIndex("monitor_daily_stats_unique_idx").on(table.monitorId, table.date),
		index("monitor_daily_stats_date_idx").on(table.date),
	],
);

// ============================================================================
// INCIDENT TABLES
// ============================================================================

export const incident = pgTable(
	"incident",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		status: text("status").notNull().default("investigating"), // 'investigating' | 'identified' | 'monitoring' | 'resolved'
		impact: text("impact").notNull().default("minor"), // 'none' | 'minor' | 'major' | 'critical'
		startedAt: timestamp("started_at").notNull().defaultNow(),
		resolvedAt: timestamp("resolved_at"),
		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		isAutoCreated: boolean("is_auto_created").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("incident_org_idx").on(table.organizationId),
		index("incident_status_idx").on(table.status),
		index("incident_started_at_idx").on(table.startedAt),
	],
);

export const incidentMonitor = pgTable(
	"incident_monitor",
	{
		incidentId: text("incident_id").notNull(),
		monitorId: text("monitor_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.incidentId, table.monitorId] }),
		foreignKey({
			columns: [table.incidentId],
			foreignColumns: [incident.id],
			name: "im_incident_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.monitorId],
			foreignColumns: [monitor.id],
			name: "im_monitor_fk",
		}).onDelete("cascade"),
	],
);

export const incidentUpdate = pgTable(
	"incident_update",
	{
		id: text("id").primaryKey(),
		incidentId: text("incident_id")
			.notNull()
			.references(() => incident.id, { onDelete: "cascade" }),
		status: text("status").notNull(),
		message: text("message").notNull(),
		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [index("incident_update_incident_idx").on(table.incidentId)],
);

// ============================================================================
// STATUS PAGE TABLES
// ============================================================================

export const statusPage = pgTable(
	"status_page",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		description: text("description"),
		isPublic: boolean("is_public").notNull().default(true),

		// Branding
		logoUrl: text("logo_url"),
		faviconUrl: text("favicon_url"),
		primaryColor: text("primary_color").default("#000000"),
		customCss: text("custom_css"),

		// Custom domain
		customDomain: text("custom_domain").unique(),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [index("status_page_org_idx").on(table.organizationId)],
);

export const statusPageGroup = pgTable(
	"status_page_group",
	{
		id: text("id").primaryKey(),
		statusPageId: text("status_page_id")
			.notNull()
			.references(() => statusPage.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		order: integer("order").notNull().default(0),
		isCollapsed: boolean("is_collapsed").notNull().default(false),
	},
	(table) => [index("status_page_group_page_idx").on(table.statusPageId)],
);

export const statusPageMonitor = pgTable(
	"status_page_monitor",
	{
		id: text("id").primaryKey(),
		statusPageId: text("status_page_id")
			.notNull()
			.references(() => statusPage.id, { onDelete: "cascade" }),
		monitorId: text("monitor_id")
			.notNull()
			.references(() => monitor.id, { onDelete: "cascade" }),
		groupId: text("group_id").references(() => statusPageGroup.id, { onDelete: "set null" }),
		displayName: text("display_name"),
		order: integer("order").notNull().default(0),
	},
	(table) => [
		index("status_page_monitor_page_idx").on(table.statusPageId),
		uniqueIndex("status_page_monitor_unique_idx").on(table.statusPageId, table.monitorId),
	],
);

// ============================================================================
// NOTIFICATION TABLES
// ============================================================================

export const notificationChannel = pgTable(
	"notification_channel",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		type: text("type").notNull(), // 'email' | 'slack' | 'discord' | 'webhook'
		config: jsonb("config")
			.$type<{
				// Email
				email?: string;
				// Slack
				webhookUrl?: string;
				channel?: string;
				// Discord
				discordWebhookUrl?: string;
				// Webhook
				url?: string;
				method?: string;
				headers?: Record<string, string>;
				bodyTemplate?: string;
			}>()
			.notNull(),
		enabled: boolean("enabled").notNull().default(true),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [index("notification_channel_org_idx").on(table.organizationId)],
);

export const monitorNotificationChannel = pgTable(
	"monitor_notification_channel",
	{
		monitorId: text("monitor_id").notNull(),
		channelId: text("channel_id").notNull(),
		notifyOnDown: boolean("notify_on_down").notNull().default(true),
		notifyOnUp: boolean("notify_on_up").notNull().default(true),
		notifyOnDegraded: boolean("notify_on_degraded").notNull().default(false),
		notifyOnSslExpiry: boolean("notify_on_ssl_expiry").notNull().default(true),
	},
	(table) => [
		primaryKey({ columns: [table.monitorId, table.channelId] }),
		foreignKey({
			columns: [table.monitorId],
			foreignColumns: [monitor.id],
			name: "mnc_monitor_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.channelId],
			foreignColumns: [notificationChannel.id],
			name: "mnc_channel_fk",
		}).onDelete("cascade"),
	],
);

export const notificationLog = pgTable(
	"notification_log",
	{
		id: text("id").primaryKey(),
		channelId: text("channel_id")
			.notNull()
			.references(() => notificationChannel.id, { onDelete: "cascade" }),
		monitorId: text("monitor_id").references(() => monitor.id, { onDelete: "set null" }),
		incidentId: text("incident_id").references(() => incident.id, { onDelete: "set null" }),
		type: text("type").notNull(), // 'monitor_down' | 'monitor_up' | 'incident_created' | 'incident_updated' | 'ssl_expiry'
		status: text("status").notNull(), // 'sent' | 'failed'
		errorMessage: text("error_message"),
		sentAt: timestamp("sent_at").notNull().defaultNow(),
	},
	(table) => [
		index("notification_log_channel_idx").on(table.channelId),
		index("notification_log_sent_at_idx").on(table.sentAt),
	],
);

export const notificationEvent = pgTable(
	"notification_event",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		monitorId: text("monitor_id").references(() => monitor.id, { onDelete: "cascade" }),
		incidentId: text("incident_id").references(() => incident.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		// 'monitor_down' | 'monitor_up' | 'monitor_degraded' | 'ssl_expiry_warning'
		// | 'incident_created' | 'incident_updated' | 'incident_resolved'
		payload: jsonb("payload").notNull(),
		status: text("status").notNull().default("pending"),
		// 'pending' | 'processing' | 'processed' | 'suppressed' | 'failed' | 'sent'
		claimedAt: timestamp("claimed_at"),
		processedAt: timestamp("processed_at"),
		errorMessage: text("error_message"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("notification_event_status_created_idx").on(table.status, table.createdAt),
		index("notification_event_monitor_type_idx").on(
			table.monitorId,
			table.type,
			table.createdAt,
		),
		index("notification_event_org_idx").on(table.organizationId, table.createdAt),
	],
);

export const notificationEventRelations = relations(notificationEvent, ({ one }) => ({
	organization: one(organization, {
		fields: [notificationEvent.organizationId],
		references: [organization.id],
	}),
	monitor: one(monitor, {
		fields: [notificationEvent.monitorId],
		references: [monitor.id],
	}),
	incident: one(incident, {
		fields: [notificationEvent.incidentId],
		references: [incident.id],
	}),
}));

// ============================================================================
// RELATIONS (extends auth-schema relations for app tables)
// ============================================================================

export const organizationRelations = relations(organization, ({ one, many }) => ({
	members: many(member),
	invitations: many(invitation),
	monitors: many(monitor),
	incidents: many(incident),
	statusPages: many(statusPage),
	notificationChannels: many(notificationChannel),
	notificationEvents: many(notificationEvent),
	subscription: one(subscription),
	usageWarnings: many(usageWarning),
}));

export const monitorRelations = relations(monitor, ({ one, many }) => ({
	organization: one(organization, {
		fields: [monitor.organizationId],
		references: [organization.id],
	}),
	checks: many(monitorCheck),
	status: one(monitorStatus),
	dailyStats: many(monitorDailyStats),
	notificationChannels: many(monitorNotificationChannel),
	notificationEvents: many(notificationEvent),
	statusPageMonitors: many(statusPageMonitor),
	incidentMonitors: many(incidentMonitor),
}));

export const monitorCheckRelations = relations(monitorCheck, ({ one }) => ({
	monitor: one(monitor, {
		fields: [monitorCheck.monitorId],
		references: [monitor.id],
	}),
}));

export const monitorStatusRelations = relations(monitorStatus, ({ one }) => ({
	monitor: one(monitor, {
		fields: [monitorStatus.monitorId],
		references: [monitor.id],
	}),
}));

export const monitorDailyStatsRelations = relations(monitorDailyStats, ({ one }) => ({
	monitor: one(monitor, {
		fields: [monitorDailyStats.monitorId],
		references: [monitor.id],
	}),
}));

export const incidentRelations = relations(incident, ({ one, many }) => ({
	organization: one(organization, {
		fields: [incident.organizationId],
		references: [organization.id],
	}),
	createdByUser: one(user, {
		fields: [incident.createdBy],
		references: [user.id],
	}),
	updates: many(incidentUpdate),
	monitors: many(incidentMonitor),
	notificationEvents: many(notificationEvent),
}));

export const incidentMonitorRelations = relations(incidentMonitor, ({ one }) => ({
	incident: one(incident, {
		fields: [incidentMonitor.incidentId],
		references: [incident.id],
	}),
	monitor: one(monitor, {
		fields: [incidentMonitor.monitorId],
		references: [monitor.id],
	}),
}));

export const incidentUpdateRelations = relations(incidentUpdate, ({ one }) => ({
	incident: one(incident, {
		fields: [incidentUpdate.incidentId],
		references: [incident.id],
	}),
	createdByUser: one(user, {
		fields: [incidentUpdate.createdBy],
		references: [user.id],
	}),
}));

export const statusPageRelations = relations(statusPage, ({ one, many }) => ({
	organization: one(organization, {
		fields: [statusPage.organizationId],
		references: [organization.id],
	}),
	groups: many(statusPageGroup),
	monitors: many(statusPageMonitor),
}));

export const statusPageGroupRelations = relations(statusPageGroup, ({ one, many }) => ({
	statusPage: one(statusPage, {
		fields: [statusPageGroup.statusPageId],
		references: [statusPage.id],
	}),
	monitors: many(statusPageMonitor),
}));

export const statusPageMonitorRelations = relations(statusPageMonitor, ({ one }) => ({
	statusPage: one(statusPage, {
		fields: [statusPageMonitor.statusPageId],
		references: [statusPage.id],
	}),
	monitor: one(monitor, {
		fields: [statusPageMonitor.monitorId],
		references: [monitor.id],
	}),
	group: one(statusPageGroup, {
		fields: [statusPageMonitor.groupId],
		references: [statusPageGroup.id],
	}),
}));

export const notificationChannelRelations = relations(notificationChannel, ({ one, many }) => ({
	organization: one(organization, {
		fields: [notificationChannel.organizationId],
		references: [organization.id],
	}),
	monitorChannels: many(monitorNotificationChannel),
	logs: many(notificationLog),
}));

export const monitorNotificationChannelRelations = relations(
	monitorNotificationChannel,
	({ one }) => ({
		monitor: one(monitor, {
			fields: [monitorNotificationChannel.monitorId],
			references: [monitor.id],
		}),
		channel: one(notificationChannel, {
			fields: [monitorNotificationChannel.channelId],
			references: [notificationChannel.id],
		}),
	}),
);

export const notificationLogRelations = relations(notificationLog, ({ one }) => ({
	channel: one(notificationChannel, {
		fields: [notificationLog.channelId],
		references: [notificationChannel.id],
	}),
	monitor: one(monitor, {
		fields: [notificationLog.monitorId],
		references: [monitor.id],
	}),
	incident: one(incident, {
		fields: [notificationLog.incidentId],
		references: [incident.id],
	}),
}));

// ============================================================================
// MAINTENANCE JOB TABLE
// ============================================================================

export const maintenanceJob = pgTable("maintenance_job", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	cronExpression: text("cron_expression").notNull(),
	nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
	lastRunAt: timestamp("last_run_at", { withTimezone: true }),
	lastError: text("last_error"),
	enabled: boolean("enabled").default(true),
});

// ============================================================================
// SUBSCRIPTION TABLES
// ============================================================================

export const subscription = pgTable(
	"subscription",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.unique()
			.references(() => organization.id, { onDelete: "cascade" }),
		planId: text("plan_id").notNull().default("free"), // 'free' | 'pro' | 'enterprise'
		status: text("status").notNull().default("active"), // 'active' | 'canceled' | 'past_due' | 'trialing'

		// Billing period
		currentPeriodStart: timestamp("current_period_start"),
		currentPeriodEnd: timestamp("current_period_end"),

		// Polar integration
		polarCustomerId: text("polar_customer_id"),
		polarSubscriptionId: text("polar_subscription_id"),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("subscription_org_idx").on(table.organizationId),
		index("subscription_polar_customer_idx").on(table.polarCustomerId),
	],
);

export const usageWarning = pgTable(
	"usage_warning",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		resourceType: text("resource_type").notNull(), // 'monitors' | 'statusPages'
		warningLevel: integer("warning_level").notNull(), // e.g., 80, 100
		sentAt: timestamp("sent_at").notNull().defaultNow(),
	},
	(table) => [
		index("usage_warning_org_idx").on(table.organizationId),
		index("usage_warning_sent_at_idx").on(table.sentAt),
	],
);

export const subscriptionRelations = relations(subscription, ({ one }) => ({
	organization: one(organization, {
		fields: [subscription.organizationId],
		references: [organization.id],
	}),
}));

export const usageWarningRelations = relations(usageWarning, ({ one }) => ({
	organization: one(organization, {
		fields: [usageWarning.organizationId],
		references: [organization.id],
	}),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Monitor = typeof monitor.$inferSelect;
export type NewMonitor = typeof monitor.$inferInsert;

export type MonitorCheck = typeof monitorCheck.$inferSelect;
export type NewMonitorCheck = typeof monitorCheck.$inferInsert;

export type MonitorStatus = typeof monitorStatus.$inferSelect;
export type NewMonitorStatus = typeof monitorStatus.$inferInsert;

export type MonitorDailyStats = typeof monitorDailyStats.$inferSelect;
export type NewMonitorDailyStats = typeof monitorDailyStats.$inferInsert;

export type Incident = typeof incident.$inferSelect;
export type NewIncident = typeof incident.$inferInsert;

export type IncidentUpdate = typeof incidentUpdate.$inferSelect;
export type NewIncidentUpdate = typeof incidentUpdate.$inferInsert;

export type StatusPage = typeof statusPage.$inferSelect;
export type NewStatusPage = typeof statusPage.$inferInsert;

export type StatusPageGroup = typeof statusPageGroup.$inferSelect;
export type NewStatusPageGroup = typeof statusPageGroup.$inferInsert;

export type StatusPageMonitor = typeof statusPageMonitor.$inferSelect;
export type NewStatusPageMonitor = typeof statusPageMonitor.$inferInsert;

export type NotificationChannel = typeof notificationChannel.$inferSelect;
export type NewNotificationChannel = typeof notificationChannel.$inferInsert;

export type NotificationLog = typeof notificationLog.$inferSelect;
export type NewNotificationLog = typeof notificationLog.$inferInsert;

export type MaintenanceJob = typeof maintenanceJob.$inferSelect;
export type NewMaintenanceJob = typeof maintenanceJob.$inferInsert;

export type Subscription = typeof subscription.$inferSelect;
export type NewSubscription = typeof subscription.$inferInsert;

export type UsageWarning = typeof usageWarning.$inferSelect;
export type NewUsageWarning = typeof usageWarning.$inferInsert;
