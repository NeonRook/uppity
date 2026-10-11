import { appUrl, escapeHtml } from "./account-email";
import { CONFIRMATION_TTL_HOURS } from "./services/status-page-subscriber.service";
import { smtpFrom, smtpTransport } from "./smtp";

export interface SubscriptionConfirmation {
	email: string;
	token: string;
	page: { name: string; slug: string };
}

/** Sends the double opt-in link for a status page subscription. Throws when it cannot. */
export async function sendSubscriptionConfirmation({
	email,
	token,
	page,
}: SubscriptionConfirmation): Promise<void> {
	if (!smtpTransport) throw new Error("SMTP not configured");

	const confirmUrl = `${appUrl}/status/${page.slug}/confirm/${token}`;
	const paragraphs = [
		`You asked to get an email whenever ${page.name} reports an incident. Confirm to start receiving them. The link works for ${CONFIRMATION_TTL_HOURS} hours.`,
		"If you didn't ask for this, ignore this email. You won't hear from us again.",
	];

	await smtpTransport.sendMail({
		from: smtpFrom,
		to: email,
		subject: `Confirm your subscription to ${page.name} status updates`,
		html: [
			`<p>${escapeHtml(paragraphs[0])}</p>`,
			`<p><a href="${confirmUrl}">Confirm subscription</a></p>`,
			`<p>${escapeHtml(paragraphs[1])}</p>`,
		].join("\n"),
		text: [paragraphs[0], "", `Confirm subscription: ${confirmUrl}`, "", paragraphs[1]].join("\n"),
	});
}
