import { createTransport } from "nodemailer";

import { DEFAULT_EMAIL_FROM, DEFAULT_SMTP_SECURE_PORT } from "#lib/constants/defaults.js";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;

/** Null when SMTP_HOST or SMTP_PORT is unset. */
export const smtpTransport =
	SMTP_HOST && SMTP_PORT
		? createTransport({
				host: SMTP_HOST,
				port: parseInt(SMTP_PORT, 10),
				secure: SMTP_PORT === String(DEFAULT_SMTP_SECURE_PORT),
				auth: SMTP_USER && SMTP_PASSWORD ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
			})
		: null;

export const smtpFrom = SMTP_FROM || DEFAULT_EMAIL_FROM;
