import { createTransport } from "nodemailer";

import { DEFAULT_EMAIL_FROM, DEFAULT_SMTP_SECURE_PORT } from "#lib/constants/defaults.js";

/**
 * A hung server must fail a send well inside the notifier's stuck-row threshold, or a sweep
 * sends the row again while the first attempt still runs.
 */
const CONNECTION_TIMEOUT_MS = 30_000;
const SOCKET_TIMEOUT_MS = 60_000;

/** Null when host or port is unset. */
function transport(host?: string, port?: string, user?: string, pass?: string) {
	if (!host || !port) return null;
	const auth = user && pass ? { user, pass } : undefined;
	return createTransport({
		host,
		port: parseInt(port, 10),
		secure: port === String(DEFAULT_SMTP_SECURE_PORT),
		// STARTTLS is otherwise opportunistic: a server that does not offer it
		// would receive the credentials in the clear.
		requireTLS: auth !== undefined,
		auth,
		connectionTimeout: CONNECTION_TIMEOUT_MS,
		socketTimeout: SOCKET_TIMEOUT_MS,
	});
}

const { env } = process;

export const smtpTransport = transport(
	env.SMTP_HOST,
	env.SMTP_PORT,
	env.SMTP_USER,
	env.SMTP_PASSWORD,
);
export const smtpFrom = env.SMTP_FROM || DEFAULT_EMAIL_FROM;

// Subscriber addresses are typed in by visitors, so their bounces and
// complaints can go to a separate account that cannot take operator alerts
// down with it. Unset, subscriber mail shares the main server.
export const subscriberTransport =
	transport(
		env.SUBSCRIBER_SMTP_HOST,
		env.SUBSCRIBER_SMTP_PORT,
		env.SUBSCRIBER_SMTP_USER,
		env.SUBSCRIBER_SMTP_PASSWORD,
	) ?? smtpTransport;
export const subscriberFrom = env.SUBSCRIBER_SMTP_FROM || smtpFrom;
