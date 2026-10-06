import { smtpFrom, smtpTransport } from "../smtp";
import { describeNotification } from "./message";
import type { NotificationPayload, NotificationResult } from "./types";

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export async function sendEmail(
	config: { email: string },
	payload: NotificationPayload,
): Promise<NotificationResult> {
	if (!smtpTransport) {
		return { success: false, errorMessage: "SMTP not configured" };
	}

	const { title, fields, details } = describeNotification(payload);
	const rows = [...fields, ["Time", payload.timestamp.toISOString()], ...details];

	try {
		await smtpTransport.sendMail({
			from: smtpFrom,
			to: config.email,
			subject: title,
			html: [
				`<h2>${escapeHtml(title)}</h2>`,
				...rows.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`),
			].join("\n"),
			text: [title, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n"),
		});
		return { success: true };
	} catch (error) {
		return {
			success: false,
			errorMessage: error instanceof Error ? error.message : "Failed to send email",
		};
	}
}
