import { Agent, type buildConnector } from "undici";

import { BlockedTargetError, dial, ProbeError, type Dialed } from "../tcp";
import type { NotificationResult } from "./types";

const CONNECT_TIMEOUT_MS = 10_000;
/** Well inside the notifier's stuck-row threshold, as the SMTP timeouts are. */
const DELIVERY_TIMEOUT_MS = 30_000;
const ERROR_BODY_MAX_BYTES = 512;

/**
 * Delivers to the URLs users configure. Every connection, including each redirect
 * hop, dials through `dial`, so private addresses are refused unless the operator
 * allows them.
 */
const deliveries = new Agent({
	connect: (options, callback) => {
		void connect(options, callback);
	},
});

async function connect(
	{ hostname, port, protocol }: buildConnector.Options,
	callback: buildConnector.Callback,
): Promise<void> {
	const https = protocol === "https:";
	let dialed: Dialed;
	try {
		dialed = await dial({
			host: hostname,
			port: Number(port) || (https ? 443 : 80),
			tls: https ? { acceptSelfSigned: false } : undefined,
			signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
		});
	} catch (error) {
		callback(error instanceof Error ? error : new Error(String(error)), null);
		return;
	}
	callback(null, dialed.socket);
}

/** Overload and rate limit answers. Any other 4xx will get the same answer next time. */
const isTransientStatus = (status: number) =>
	status >= 500 || status === 408 || status === 425 || status === 429;

/** fetch wraps connection failures; the cause says what went wrong. */
function failure(error: unknown, label: string): NotificationResult {
	const cause = error instanceof Error && error.cause instanceof ProbeError ? error.cause : error;
	return {
		success: false,
		errorMessage: cause instanceof Error ? cause.message : `Failed to send ${label} notification`,
		transient: !(cause instanceof BlockedTargetError),
	};
}

/** Decodes up to `limit` bytes of `body`; leaving the loop cancels the rest. */
async function readPrefix(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
	if (!body) return "";
	const chunks: Uint8Array[] = [];
	let read = 0;
	for await (const chunk of body) {
		chunks.push(chunk);
		read += chunk.byteLength;
		if (read >= limit) break;
	}
	return Buffer.concat(chunks).subarray(0, limit).toString("utf8");
}

/** POSTs `body` as JSON. Never throws; failures come back as a result. */
export async function postJson(
	url: string,
	body: unknown,
	label: string,
	init: { method?: string; headers?: Record<string, string> } = {},
): Promise<NotificationResult> {
	try {
		// Node's fetch takes an undici dispatcher, which the DOM RequestInit type does not list.
		const request: RequestInit & { dispatcher: Agent } = {
			method: init.method || "POST",
			headers: { "Content-Type": "application/json", ...init.headers },
			body: JSON.stringify(body),
			dispatcher: deliveries,
			signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
		};
		const response = await fetch(url, request);

		if (!response.ok) {
			const text = await readPrefix(response.body, ERROR_BODY_MAX_BYTES);
			return {
				success: false,
				errorMessage: `${label} error: ${response.status} - ${text}`,
				transient: isTransientStatus(response.status),
			};
		}

		return { success: true };
	} catch (error) {
		return failure(error, label);
	}
}
