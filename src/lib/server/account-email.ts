import { GRACE_PERIOD_DAYS, type CapacityNotice } from "./services/capacity.service";
import { smtpFrom, smtpTransport } from "./smtp";

export const appUrl = process.env.BETTER_AUTH_URL || "https://localhost:3000";

export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const formatDate = (date: Date) =>
	new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(date);

/** Subject, paragraphs, and the monitors to list, for one notice. */
function describe(notice: CapacityNotice): {
	subject: string;
	paragraphs: string[];
	monitors: string[];
} {
	const remedy =
		"To keep them running, add capacity, or pause or delete monitors you don't need. Paused monitors don't count toward the limit.";

	if (notice.kind === "paused") {
		return {
			subject: `We paused ${notice.paused.length} monitors in ${notice.organizationName}`,
			paragraphs: [
				`${notice.organizationName} stayed above its limit of ${notice.ceiling} active monitors for ${GRACE_PERIOD_DAYS} days, so we paused its newest monitors to bring it back within the limit. Nothing was deleted.`,
				"They resume automatically when you add capacity. You can also resume them yourself once there is room.",
			],
			monitors: notice.paused,
		};
	}

	const date = formatDate(notice.pauseAt);
	const excess = notice.active - notice.ceiling;
	const subject = {
		over: `${notice.organizationName} is over its monitor limit`,
		week: `${notice.organizationName}: monitors will be paused in 7 days`,
		day: `${notice.organizationName}: monitors will be paused tomorrow`,
	}[notice.kind];

	return {
		subject,
		paragraphs: [
			`${notice.organizationName} has ${notice.active} active monitors and a limit of ${notice.ceiling}. On ${date} (UTC), we will pause the ${excess} newest to bring it back within the limit.`,
			remedy,
		],
		monitors: notice.toPause,
	};
}

/** Sends an over-capacity notice from the account address. Throws when it cannot. */
export async function sendCapacityNotice(to: string[], notice: CapacityNotice): Promise<void> {
	if (!smtpTransport) throw new Error("SMTP not configured");
	if (to.length === 0) throw new Error("No owner or admin to notify");

	const { subject, paragraphs, monitors } = describe(notice);
	const billingUrl = `${appUrl}/settings/billing`;

	await smtpTransport.sendMail({
		from: smtpFrom,
		to,
		subject,
		html: [
			...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
			`<ul>${monitors.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`,
			`<p><a href="${billingUrl}">Manage capacity</a></p>`,
		].join("\n"),
		text: [
			...paragraphs,
			"",
			...monitors.map((name) => `- ${name}`),
			"",
			`Manage capacity: ${billingUrl}`,
		].join("\n"),
	});
}

export interface ChannelUnsubscribedNotice {
	organizationName: string;
	channelName: string;
	email: string;
	final: boolean;
}

/** Tells an organization's owners and admins that an address stopped its alerts. Throws when it cannot. */
export async function sendChannelUnsubscribedNotice(
	to: string[],
	{ organizationName, channelName, email, final }: ChannelUnsubscribedNotice,
): Promise<void> {
	if (!smtpTransport) throw new Error("SMTP not configured");
	if (to.length === 0) throw new Error("No owner or admin to notify");

	const channelsUrl = `${appUrl}/notifications`;
	const paragraphs = [
		`${email} unsubscribed from the alerts that the "${channelName}" channel in ${organizationName} sends. Monitors using that channel no longer alert it.`,
		final
			? "You already asked this address again once, so it can't be asked again. To keep alerts flowing, point the channel at another address."
			: "If this was a mistake, for example on a shared team address, you can ask the address to confirm once more from your notification channels.",
	];

	await smtpTransport.sendMail({
		from: smtpFrom,
		to,
		subject: `Alerts to ${email} stopped in ${organizationName}`,
		html: [
			...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
			`<p><a href="${channelsUrl}">Open notification channels</a></p>`,
		].join("\n"),
		text: [...paragraphs, "", `Open notification channels: ${channelsUrl}`].join("\n"),
	});
}

/**
 * Sends the link that verifies an account's email address. Anyone can sign up with any
 * address, so the email carries no text the signup chose. Throws when it cannot.
 */
export async function sendAccountVerification(to: string, url: string): Promise<void> {
	if (!smtpTransport) throw new Error("SMTP not configured");

	const paragraphs = [
		"Confirm this is your email address to finish setting up your Uppity account.",
		"If you didn't sign up for Uppity, ignore this email.",
	];

	await smtpTransport.sendMail({
		from: smtpFrom,
		to,
		subject: "Verify your email address for Uppity",
		html: [
			`<p>${escapeHtml(paragraphs[0])}</p>`,
			`<p><a href="${url}">Verify email address</a></p>`,
			`<p>${escapeHtml(paragraphs[1])}</p>`,
		].join("\n"),
		text: [paragraphs[0], "", `Verify email address: ${url}`, "", paragraphs[1]].join("\n"),
	});
}
