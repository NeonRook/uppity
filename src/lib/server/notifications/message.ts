import type { LateDelivery, NotificationPayload, NotificationType } from "./types";

type Pair = [label: string, value: string];

/** Channel-neutral content of one notification; each channel renders it in its own format. */
export interface NotificationMessage {
	title: string;
	color: number;
	/** Short values, shown side by side where the channel supports it. */
	fields: Pair[];
	/** Long values, shown one per line. */
	details: Pair[];
}

const RED = 0xdc2626;
const GREEN = 0x16a34a;
const YELLOW = 0xeab308;
const ORANGE = 0xf97316;
const AMBER = 0xf59e0b;
const GRAY = 0xa1a1a1;

const inMinutes = (minutes: number) => `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

/** Says a message is late, and that what it describes has changed if it has. */
export function lateNotice({ minutes, now }: LateDelivery): string {
	const delay = `This message is ${inMinutes(minutes)} late because earlier delivery attempts failed.`;
	return now ? `${delay} It describes an earlier state: the status is now ${now}.` : delay;
}

export function describeNotification(payload: NotificationPayload): NotificationMessage {
	const monitorName = payload.monitor?.name || "Unknown Monitor";
	const incidentTitle = payload.incident?.title ?? "Unknown Incident";
	const impact = payload.incident?.impact ?? "Unknown";
	const url: Pair[] = payload.monitor?.url ? [["URL", payload.monitor.url]] : [];
	const settle = inMinutes(Math.ceil((payload.flap?.settleSeconds ?? 0) / 60));
	const reminder = inMinutes(Math.ceil((payload.flap?.reminderSeconds ?? 0) / 60));

	const messages: Record<NotificationType, () => NotificationMessage> = {
		monitor_down: () => ({
			title: `🔴 Monitor Down: ${monitorName}`,
			color: RED,
			fields: [["Status", "Down"]],
			details: [...(payload.errorMessage ? [["Error", payload.errorMessage] as Pair] : []), ...url],
		}),
		monitor_up: () => ({
			title: `🟢 Monitor Recovered: ${monitorName}`,
			color: GREEN,
			fields: [
				["Status", "Recovered"],
				["Previous Status", payload.previousStatus || "Down"],
			],
			details: url,
		}),
		monitor_degraded: () => ({
			title: `🟡 Monitor Degraded: ${monitorName}`,
			color: YELLOW,
			fields: [["Status", "Degraded (high response time)"]],
			details: url,
		}),
		monitor_checks_stopped: () => ({
			title: `⚪ Monitor Not Being Checked: ${monitorName}`,
			color: GRAY,
			fields: [["Status", "Not being checked"]],
			details: [
				[
					"Reason",
					"Uppity failed to run this monitor's checks. It keeps retrying and will tell you when checks resume. The status shown until then is not current.",
				],
				...url,
			],
		}),
		monitor_checks_resumed: () => ({
			title: `🟢 Monitor Checks Resumed: ${monitorName}`,
			color: GREEN,
			fields: [["Status", "Being checked again"]],
			details: url,
		}),
		monitor_flapping: () => ({
			title: `🟠 Monitor Flapping: ${monitorName}`,
			color: ORANGE,
			fields: [
				["Status", "Flapping"],
				["Last Check", payload.status?.status ?? "Unknown"],
			],
			details: [
				[
					"Reason",
					`This monitor keeps going down and recovering, so its status alerts are on hold. You get one alert when it stays down for ${settle} or goes ${settle} without going down, and a reminder every ${reminder} until then.`,
				],
				...url,
			],
		}),
		ssl_expiry_warning: () => ({
			title: `⚠️ SSL Certificate Expiring: ${monitorName}`,
			color: ORANGE,
			fields: [["Days Remaining", String(payload.sslDaysRemaining)]],
			details: url,
		}),
		incident_created: () => ({
			title: `🚨 Incident Created: ${incidentTitle}`,
			color: RED,
			fields: [
				["Impact", impact],
				["Status", payload.incident?.status ?? "Investigating"],
			],
			details: [],
		}),
		incident_updated: () => ({
			title: `📝 Incident Update: ${incidentTitle}`,
			color: AMBER,
			fields: [
				["Status", payload.incident?.status ?? "Unknown"],
				["Impact", impact],
			],
			details: payload.updateMessage ? [["Update", payload.updateMessage]] : [],
		}),
		incident_resolved: () => ({
			title: `✅ Incident Resolved: ${incidentTitle}`,
			color: GREEN,
			fields: [],
			details: [],
		}),
	};

	const message = messages[payload.type]();
	const { late } = payload;
	if (!late) return message;
	return {
		...message,
		title: `Delayed${late.now ? `, now ${late.now}` : ""}: ${message.title}`,
		color: late.now ? GRAY : message.color,
		details: [["Delivery", lateNotice(late)], ...message.details],
	};
}
