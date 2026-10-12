import { appUrl, escapeHtml } from "../account-email";
import { CONFIRMATION_TTL_HOURS } from "../services/email-channel.service";
import { smtpFrom, smtpTransport, subscriberFrom, subscriberTransport } from "../smtp";
import { describeNotification } from "./message";
import type { NotificationPayload, NotificationResult } from "./types";

const confirmUrl = (token: string) => `${appUrl}/alerts/confirm/${token}`;
const unsubscribeUrl = (token: string) => `${appUrl}/alerts/unsubscribe/${token}`;

export interface ChannelConfirmation {
	email: string;
	token: string;
	/** A verified account email, or null when the member's address is unverified. */
	requestedBy: string | null;
}

/**
 * Asks the owner of an email channel address to accept alerts. Goes through the
 * subscriber server, since the organization typed in an address that never agreed
 * to mail. Carries no text the organization chose, so it cannot carry spam; the
 * confirm page names the organization. Throws when it cannot send.
 */
export async function sendChannelConfirmation({
	email,
	token,
	requestedBy,
}: ChannelConfirmation): Promise<void> {
	if (!subscriberTransport) throw new Error("SMTP not configured");

	const paragraphs = [
		`${requestedBy ?? "Someone using Uppity"} wants this address to receive monitoring alerts from Uppity. Confirm to start receiving them. The link works for ${CONFIRMATION_TTL_HOURS} hours.`,
		"If you don't want these alerts, ignore this email or unsubscribe. After an unsubscribe, the sender can ask you only once more.",
	];

	await subscriberTransport.sendMail({
		from: subscriberFrom,
		to: email,
		subject: "Confirm alert emails from Uppity",
		headers: { "List-Unsubscribe": `<${unsubscribeUrl(token)}>` },
		html: [
			`<p>${escapeHtml(paragraphs[0])}</p>`,
			`<p><a href="${confirmUrl(token)}">Confirm alerts</a></p>`,
			`<p><small>${escapeHtml(paragraphs[1])} <a href="${unsubscribeUrl(token)}">Unsubscribe</a></small></p>`,
		].join("\n"),
		text: [
			paragraphs[0],
			"",
			`Confirm alerts: ${confirmUrl(token)}`,
			"",
			paragraphs[1],
			`Unsubscribe: ${unsubscribeUrl(token)}`,
		].join("\n"),
	});
}

export async function sendEmail(
	config: { email: string; token: string },
	payload: NotificationPayload,
): Promise<NotificationResult> {
	if (!smtpTransport) {
		return { success: false, errorMessage: "SMTP not configured" };
	}

	const { title, fields, details } = describeNotification(payload);
	const rows = [...fields, ["Time", payload.timestamp.toISOString()], ...details];
	const unsubscribe = unsubscribeUrl(config.token);
	const footer = "You get this email because this address is an alert channel in Uppity.";

	try {
		await smtpTransport.sendMail({
			from: smtpFrom,
			to: config.email,
			subject: title,
			headers: { "List-Unsubscribe": `<${unsubscribe}>` },
			html: [
				`<h2>${escapeHtml(title)}</h2>`,
				...rows.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`),
				`<p><small>${escapeHtml(footer)} <a href="${unsubscribe}">Unsubscribe</a></small></p>`,
			].join("\n"),
			text: [
				title,
				"",
				...rows.map(([label, value]) => `${label}: ${value}`),
				"",
				footer,
				`Unsubscribe: ${unsubscribe}`,
			].join("\n"),
		});
		return { success: true };
	} catch (error) {
		return {
			success: false,
			errorMessage: error instanceof Error ? error.message : "Failed to send email",
		};
	}
}
