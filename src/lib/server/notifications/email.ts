import nodemailer from "nodemailer";

import type {
	NotificationPayload,
	NotificationResult,
	NotificationProvider,
	EmailConfig,
} from "./types";

// Use Bun.env directly to ensure runtime resolution
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = Bun.env;

export class EmailNotificationProvider implements NotificationProvider {
	private transporter: nodemailer.Transporter | null = null;
	private config: EmailConfig;

	constructor(config: EmailConfig) {
		this.config = config;
		this.initTransporter();
	}

	private initTransporter() {
		if (SMTP_HOST && SMTP_PORT) {
			this.transporter = nodemailer.createTransport({
				host: SMTP_HOST,
				port: parseInt(SMTP_PORT, 10),
				secure: SMTP_PORT === "465",
				auth:
					SMTP_USER && SMTP_PASSWORD
						? {
								user: SMTP_USER,
								pass: SMTP_PASSWORD,
							}
						: undefined,
			});
		}
	}

	async send(payload: NotificationPayload): Promise<NotificationResult> {
		if (!this.transporter) {
			return {
				success: false,
				errorMessage: "SMTP not configured",
			};
		}

		try {
			const { subject, html, text } = this.formatMessage(payload);

			await this.transporter.sendMail({
				from: SMTP_FROM || "Uppity <noreply@uppity.app>",
				to: this.config.email,
				subject,
				html,
				text,
			});

			return { success: true };
		} catch (error) {
			return {
				success: false,
				errorMessage: error instanceof Error ? error.message : "Failed to send email",
			};
		}
	}

	private formatMessage(payload: NotificationPayload): {
		subject: string;
		html: string;
		text: string;
	} {
		const monitorName = payload.monitor?.name || "Unknown Monitor";
		const timestamp = payload.timestamp.toISOString();

		switch (payload.type) {
			case "monitor_down":
				return {
					subject: `🔴 Monitor Down: ${monitorName}`,
					html: `
						<h2>Monitor Alert: ${monitorName} is DOWN</h2>
						<p><strong>Status:</strong> Down</p>
						<p><strong>Time:</strong> ${timestamp}</p>
						${payload.errorMessage ? `<p><strong>Error:</strong> ${payload.errorMessage}</p>` : ""}
						${payload.monitor?.url ? `<p><strong>URL:</strong> ${payload.monitor.url}</p>` : ""}
					`,
					text: `Monitor Alert: ${monitorName} is DOWN\n\nTime: ${timestamp}\n${payload.errorMessage ? `Error: ${payload.errorMessage}\n` : ""}${payload.monitor?.url ? `URL: ${payload.monitor.url}` : ""}`,
				};

			case "monitor_up":
				return {
					subject: `🟢 Monitor Recovered: ${monitorName}`,
					html: `
						<h2>Monitor Alert: ${monitorName} is UP</h2>
						<p><strong>Status:</strong> Recovered</p>
						<p><strong>Time:</strong> ${timestamp}</p>
						<p><strong>Previous Status:</strong> ${payload.previousStatus || "Down"}</p>
						${payload.monitor?.url ? `<p><strong>URL:</strong> ${payload.monitor.url}</p>` : ""}
					`,
					text: `Monitor Alert: ${monitorName} is UP\n\nTime: ${timestamp}\nPrevious Status: ${payload.previousStatus || "Down"}\n${payload.monitor?.url ? `URL: ${payload.monitor.url}` : ""}`,
				};

			case "monitor_degraded":
				return {
					subject: `🟡 Monitor Degraded: ${monitorName}`,
					html: `
						<h2>Monitor Alert: ${monitorName} is DEGRADED</h2>
						<p><strong>Status:</strong> Degraded (high response time)</p>
						<p><strong>Time:</strong> ${timestamp}</p>
						${payload.monitor?.url ? `<p><strong>URL:</strong> ${payload.monitor.url}</p>` : ""}
					`,
					text: `Monitor Alert: ${monitorName} is DEGRADED\n\nTime: ${timestamp}\n${payload.monitor?.url ? `URL: ${payload.monitor.url}` : ""}`,
				};

			case "ssl_expiry_warning":
				return {
					subject: `⚠️ SSL Certificate Expiring: ${monitorName}`,
					html: `
						<h2>SSL Certificate Warning: ${monitorName}</h2>
						<p><strong>Days Remaining:</strong> ${payload.sslDaysRemaining}</p>
						<p><strong>Time:</strong> ${timestamp}</p>
						${payload.monitor?.url ? `<p><strong>URL:</strong> ${payload.monitor.url}</p>` : ""}
					`,
					text: `SSL Certificate Warning: ${monitorName}\n\nDays Remaining: ${payload.sslDaysRemaining}\nTime: ${timestamp}\n${payload.monitor?.url ? `URL: ${payload.monitor.url}` : ""}`,
				};

			case "incident_created":
				return {
					subject: `🚨 Incident Created: ${payload.incident?.title || "New Incident"}`,
					html: `
						<h2>New Incident: ${payload.incident?.title}</h2>
						<p><strong>Impact:</strong> ${payload.incident?.impact}</p>
						<p><strong>Time:</strong> ${timestamp}</p>
					`,
					text: `New Incident: ${payload.incident?.title}\n\nImpact: ${payload.incident?.impact}\nTime: ${timestamp}`,
				};

			case "incident_resolved":
				return {
					subject: `✅ Incident Resolved: ${payload.incident?.title || "Incident"}`,
					html: `
						<h2>Incident Resolved: ${payload.incident?.title}</h2>
						<p><strong>Time:</strong> ${timestamp}</p>
					`,
					text: `Incident Resolved: ${payload.incident?.title}\n\nTime: ${timestamp}`,
				};

			default:
				return {
					subject: `Uppity Alert: ${monitorName}`,
					html: `<p>Alert for ${monitorName} at ${timestamp}</p>`,
					text: `Alert for ${monitorName} at ${timestamp}`,
				};
		}
	}
}
