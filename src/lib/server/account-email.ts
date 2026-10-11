import { GRACE_PERIOD_DAYS, type CapacityNotice } from "./services/capacity.service";
import { smtpFrom, smtpTransport } from "./smtp";

const appUrl = process.env.BETTER_AUTH_URL || "https://localhost:3000";

function escapeHtml(input: string): string {
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
