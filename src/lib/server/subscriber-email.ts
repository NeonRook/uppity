import { appUrl, escapeHtml } from "./account-email";
import { CONFIRMATION_TTL_HOURS } from "./services/status-page-subscriber.service";
import { subscriberFrom, subscriberTransport } from "./smtp";

export interface SubscriptionConfirmation {
	email: string;
	token: string;
	page: { name: string; slug: string };
}

/**
 * Sends the double opt-in link for a status page subscription. Anyone can type any address
 * into the form, so the email carries no text the page owner chose; the confirm page names
 * the page. Throws when it cannot.
 */
export async function sendSubscriptionConfirmation({
	email,
	token,
	page,
}: SubscriptionConfirmation): Promise<void> {
	if (!subscriberTransport) throw new Error("SMTP not configured");

	const confirmUrl = `${appUrl}/status/${page.slug}/confirm/${token}`;
	const paragraphs = [
		`Someone asked for this address to get an email whenever a status page on Uppity reports an incident. Confirm to start receiving them. The link works for ${CONFIRMATION_TTL_HOURS} hours.`,
		"If you didn't ask for this, ignore this email. You won't hear from us again.",
	];

	await subscriberTransport.sendMail({
		from: subscriberFrom,
		to: email,
		subject: "Confirm your status page subscription",
		html: [
			`<p>${escapeHtml(paragraphs[0])}</p>`,
			`<p><a href="${confirmUrl}">Confirm subscription</a></p>`,
			`<p>${escapeHtml(paragraphs[1])}</p>`,
		].join("\n"),
		text: [paragraphs[0], "", `Confirm subscription: ${confirmUrl}`, "", paragraphs[1]].join("\n"),
	});
}

export interface SubscriberIncidentEmail {
	email: string;
	token: string;
	page: { name: string; slug: string };
	incident: { id: string; title: string; status: string };
	kind: "incident_created" | "incident_updated" | "incident_resolved";
	message: string | undefined;
}

const SUBJECT_PREFIX = {
	incident_created: "",
	incident_updated: "Update: ",
	incident_resolved: "Resolved: ",
};

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Sends one subscriber an incident event from a status page they follow. Throws when it cannot. */
export async function sendSubscriberIncidentEmail({
	email,
	token,
	page,
	incident,
	kind,
	message,
}: SubscriberIncidentEmail): Promise<void> {
	if (!subscriberTransport) throw new Error("SMTP not configured");

	const incidentUrl = `${appUrl}/status/${page.slug}/incidents/${incident.id}`;
	const unsubscribeUrl = `${appUrl}/status/${page.slug}/unsubscribe/${token}`;
	const status = `Status: ${capitalize(incident.status)}`;
	const footer = `You get this email because you subscribed to ${page.name} status updates.`;

	await subscriberTransport.sendMail({
		from: subscriberFrom,
		to: email,
		subject: `[${page.name}] ${SUBJECT_PREFIX[kind]}${incident.title}`,
		headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
		html: [
			`<h2>${escapeHtml(incident.title)}</h2>`,
			`<p><strong>${escapeHtml(status)}</strong></p>`,
			...(message ? [`<p>${escapeHtml(message)}</p>`] : []),
			`<p><a href="${incidentUrl}">View incident</a></p>`,
			`<p><small>${escapeHtml(footer)} <a href="${unsubscribeUrl}">Unsubscribe</a></small></p>`,
		].join("\n"),
		text: [
			incident.title,
			status,
			...(message ? ["", message] : []),
			"",
			`View incident: ${incidentUrl}`,
			"",
			footer,
			`Unsubscribe: ${unsubscribeUrl}`,
		].join("\n"),
	});
}
