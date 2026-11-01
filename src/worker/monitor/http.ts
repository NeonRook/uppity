import { Agent, request, type buildConnector, type Dispatcher } from "undici";

import {
	DEFAULT_EXPECTED_STATUS_CODES,
	DEFAULT_HTTP_METHOD,
	DEFAULT_TIMEOUT_SECONDS,
	DEGRADED_RESPONSE_TIME_MS,
	USER_AGENT,
} from "../../lib/constants/defaults";
import { BODY_READ_MAX_BYTES, MAX_TIMEOUT_SECONDS } from "../../lib/constants/monitor";
import type { Monitor } from "../../lib/server/db/schema";
import {
	checkerFault,
	dial,
	failureMessage,
	ProbeError,
	socketError,
	type Certificate,
	type Dialed,
	type Phase,
} from "../../lib/server/tcp";
import type { CheckResult } from "./check";

const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Credentials a redirect to another origin must not carry, as fetch drops them. */
const ORIGIN_BOUND_HEADERS = ["authorization", "cookie", "proxy-authorization"];

/** The monitor settings an HTTP check reads. */
export type HttpTarget = Pick<
	Monitor,
	| "url"
	| "method"
	| "headers"
	| "body"
	| "timeoutSeconds"
	| "expectedStatusCodes"
	| "expectedBodyContains"
	| "followRedirects"
	| "acceptSelfSigned"
	| "sslCheckEnabled"
>;

type Timed = "dnsMs" | "connectMs" | "tlsMs" | "firstByteMs";

const round = (ms: number | undefined) => (ms === undefined ? undefined : Math.round(ms));

/** Per-phase sums across every hop. A phase that never ran stays absent. */
class Timings {
	phase: Phase = "dns";
	private readonly sums: Partial<Record<Timed, number>> = {};

	add(key: Timed, ms: number | undefined): void {
		if (ms !== undefined) this.sums[key] = (this.sums[key] ?? 0) + ms;
	}

	columns(): Partial<Record<Timed, number>> {
		return {
			dnsMs: round(this.sums.dnsMs),
			connectMs: round(this.sums.connectMs),
			tlsMs: round(this.sums.tlsMs),
			firstByteMs: round(this.sums.firstByteMs),
		};
	}
}

function lowerCaseKeys(headers: Record<string, string> | null): Record<string, string> {
	return Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
}

/** Drops a body unread. Destroying it emits an abort error, which is the point. */
function discard(body: Dispatcher.ResponseData["body"]): void {
	body.on("error", () => {});
	body.destroy();
}

/** Decodes up to `limit` bytes of `body`, then stops reading. */
async function readPrefix(body: Dispatcher.ResponseData["body"], limit: number): Promise<string> {
	const chunks: Buffer[] = [];
	let read = 0;
	for await (const chunk of body as AsyncIterable<Buffer>) {
		chunks.push(chunk);
		read += chunk.length;
		if (read >= limit) break;
	}
	return Buffer.concat(chunks).subarray(0, limit).toString("utf8");
}

function requestError(url: URL, error: unknown): unknown {
	if (!(error instanceof Error) || !("code" in error)) return error;
	switch (error.code) {
		case "UND_ERR_SOCKET":
			return new ProbeError(`${url.hostname} closed the connection without a response`);
		case "UND_ERR_HEADERS_OVERFLOW":
			return new ProbeError("Response headers are too large");
		case "UND_ERR_INVALID_ARG":
			return new ProbeError(`Request is invalid: ${error.message}`);
		case "ECONNRESET":
			return socketError(url.hostname, Number(url.port), error);
		default:
			return typeof error.code === "string" && error.code.startsWith("HPE_")
				? new ProbeError("Response is not valid HTTP")
				: error;
	}
}

/**
 * Requests the monitor's URL with a connection of its own, so every check pays for
 * DNS, connect and TLS as a new visitor does. Every hop dials through `dial`, which
 * refuses private addresses and times each phase.
 */
export async function performHttpCheck(m: HttpTarget): Promise<CheckResult> {
	if (!m.url) {
		return { status: "down", responseTimeMs: 0, errorMessage: "No URL configured" };
	}
	const target = URL.parse(m.url);
	if (!target) {
		return { status: "down", responseTimeMs: 0, errorMessage: "URL is not valid" };
	}

	const timeoutSeconds = Math.min(m.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
	const signal = AbortSignal.timeout(timeoutSeconds * 1000);
	const timings = new Timings();
	let hop = 0;
	let readyAt = 0;
	let urlCert: Certificate | undefined;

	const connect = async (
		{ hostname, port, protocol }: buildConnector.Options,
		callback: buildConnector.Callback,
	) => {
		const https = protocol === "https:";
		const firstHop = hop === 0;
		let dialed: Dialed;
		try {
			dialed = await dial({
				host: hostname,
				port: Number(port) || (https ? 443 : 80),
				tls: https ? { acceptSelfSigned: m.acceptSelfSigned } : undefined,
				signal,
				onPhase: (phase) => (timings.phase = phase),
			});
		} catch (error) {
			callback(error instanceof Error ? error : new Error(String(error)), null);
			return;
		}
		timings.add("dnsMs", dialed.dnsMs);
		timings.add("connectMs", dialed.connectMs);
		timings.add("tlsMs", dialed.tlsMs);
		// The certificate of the monitor's own URL, as the expiry warning names it.
		if (firstHop) urlCert = dialed.cert;
		timings.phase = "response";
		readyAt = performance.now();
		callback(null, dialed.socket);
	};
	const agent = new Agent({
		connect: (options, callback) => {
			void connect(options, callback);
		},
	});

	let url = target;
	let method = m.method || DEFAULT_HTTP_METHOD;
	let body = method !== "GET" && method !== "HEAD" ? (m.body ?? undefined) : undefined;
	const headers: Record<string, string> = {
		"user-agent": USER_AGENT,
		...lowerCaseKeys(m.headers),
		// A pooled socket skips DNS, connect and TLS, and would time a visit no new visitor makes.
		connection: "close",
	};
	const started = performance.now();

	try {
		let response: Dispatcher.ResponseData;
		for (;;) {
			response = await request(url, { dispatcher: agent, method, headers, body, signal }).catch(
				(error: unknown) => {
					throw requestError(url, error);
				},
			);
			timings.add("firstByteMs", performance.now() - readyAt);

			const { location } = response.headers;
			if (!m.followRedirects || !REDIRECT_STATUSES.has(response.statusCode) || !location) break;
			discard(response.body);

			if (hop === MAX_REDIRECTS) throw new ProbeError(`More than ${MAX_REDIRECTS} redirects`);
			const next = URL.parse(String(location), url);
			if (next?.protocol !== "http:" && next?.protocol !== "https:") {
				// The target's own text stays out: this message reaches alerts and public incidents.
				throw new ProbeError("Redirect to an unsupported location");
			}
			if (
				response.statusCode === 303
					? method !== "HEAD"
					: response.statusCode <= 302 && method === "POST"
			) {
				method = "GET";
				body = undefined;
				delete headers["content-type"];
			}
			if (next.origin !== url.origin) {
				for (const name of ORIGIN_BOUND_HEADERS) delete headers[name];
			}
			url = next;
			hop++;
		}

		// Response time ends at the headers; reading the body below does not count.
		const responseTimeMs = Math.round(performance.now() - started);
		const expectedCodes = m.expectedStatusCodes || [...DEFAULT_EXPECTED_STATUS_CODES];
		const statusOk = expectedCodes.includes(response.statusCode);

		let bodyOk = true;
		if (m.expectedBodyContains && statusOk) {
			timings.phase = "body";
			bodyOk = (await readPrefix(response.body, BODY_READ_MAX_BYTES)).includes(
				m.expectedBodyContains,
			);
		} else {
			discard(response.body);
		}

		let status: CheckResult["status"] = "down";
		let errorMessage: string | undefined;
		if (!statusOk) errorMessage = `Unexpected status code: ${response.statusCode}`;
		else if (bodyOk) status = responseTimeMs > DEGRADED_RESPONSE_TIME_MS ? "degraded" : "up";
		else errorMessage = "Expected body content not found";

		return {
			status,
			statusCode: response.statusCode,
			responseTimeMs,
			errorMessage,
			...timings.columns(),
			redirectCount: hop,
			...(m.sslCheckEnabled &&
				urlCert && { sslExpiresAt: urlCert.expiresAt, sslIssuer: urlCert.issuer }),
		};
	} catch (error) {
		return {
			status: "down",
			responseTimeMs: Math.round(performance.now() - started),
			errorMessage: failureMessage(error, signal, timings.phase, timeoutSeconds),
			fault: checkerFault(error, signal),
			...timings.columns(),
			redirectCount: hop,
		};
	} finally {
		await agent.destroy();
	}
}
