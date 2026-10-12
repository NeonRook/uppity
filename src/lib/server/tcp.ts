import type { LookupAddress } from "node:dns";
/**
 * Connections for monitor checks: resolve, refuse private addresses, connect, and
 * for TLS, judge the certificate. The HTTP check dials through here too, so the
 * address rules and the error messages are written once.
 *
 * The host name is resolved once, every address it resolves to is checked, and
 * the socket connects only to those addresses. A second lookup could return a
 * different answer, so none is made.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

import { isPrivateAddress, privateTargetsAllowed } from "./private-address";

/** Where a check spends its time, in order. HTTP adds the last two. */
export type Phase = "dns" | "connect" | "tls" | "response" | "body";

const PHASE_WORDS: Record<Phase, string> = {
	dns: "looking up the host name",
	connect: "connecting",
	tls: "in the TLS handshake",
	response: "waiting for the response",
	body: "reading the response body",
};

/** A failure whose message is fit to show the monitor's owner as is. */
export class ProbeError extends Error {
	override name = "ProbeError";
}

export interface Certificate {
	expiresAt: Date;
	issuer?: string;
}

export interface Dialed {
	socket: net.Socket;
	/** Absent when the host is an IP address. */
	dnsMs?: number;
	connectMs: number;
	/** Absent without TLS. */
	tlsMs?: number;
	cert?: Certificate;
}

export interface DialOptions {
	host: string;
	port: number;
	tls?: { acceptSelfSigned: boolean };
	signal: AbortSignal;
	onPhase?: (phase: Phase) => void;
}

/** Resolves when `promise` does, or rejects with the signal's reason once it aborts. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
	});
}

function errorCode(error: unknown): string | undefined {
	if (error instanceof AggregateError) return errorCode(error.errors[0]);
	if (error instanceof Error && "code" in error && typeof error.code === "string") {
		return error.code;
	}
	return undefined;
}

function dnsError(host: string, error: unknown): ProbeError {
	switch (errorCode(error)) {
		case "ENOTFOUND":
			return new ProbeError(`DNS lookup failed: ${host} does not exist`);
		case "ENODATA":
			return new ProbeError(`DNS lookup failed: ${host} has no address records`);
		case "EAI_AGAIN":
			return new ProbeError(`DNS lookup failed: no answer for ${host}`);
		default:
			return new ProbeError(`DNS lookup failed for ${host}`);
	}
}

/** Names a socket error by what happened, for any phase after the lookup. */
export function socketError(host: string, port: number, error: unknown): ProbeError {
	const code = errorCode(error);
	switch (code) {
		case "ECONNREFUSED":
			return new ProbeError(`Connection refused by ${host}:${port}`);
		case "ECONNRESET":
			return new ProbeError(`Connection reset by ${host}`);
		case "ETIMEDOUT":
			return new ProbeError(`Connection to ${host}:${port} timed out`);
		case "EHOSTUNREACH":
		case "ENETUNREACH":
			return new ProbeError(`${host} is unreachable`);
		default:
			return new ProbeError(`Connection to ${host}:${port} failed${code ? ` (${code})` : ""}`);
	}
}

function certificateError(code: string, host: string): ProbeError {
	switch (code) {
		case "CERT_HAS_EXPIRED":
			return new ProbeError("TLS certificate has expired");
		case "CERT_NOT_YET_VALID":
			return new ProbeError("TLS certificate is not valid yet");
		case "CERT_REVOKED":
			return new ProbeError("TLS certificate has been revoked");
		case "DEPTH_ZERO_SELF_SIGNED_CERT":
		case "SELF_SIGNED_CERT_IN_CHAIN":
			return new ProbeError("TLS certificate is self-signed and not trusted");
		case "UNABLE_TO_GET_ISSUER_CERT":
		case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
		case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
			return new ProbeError("TLS certificate is not trusted: its issuer is unknown");
		case "ERR_TLS_CERT_ALTNAME_INVALID":
			return new ProbeError(`TLS certificate is not valid for ${host}`);
		default:
			return new ProbeError(`TLS certificate is not trusted (${code})`);
	}
}

/**
 * Why the peer's certificate is refused, or undefined to accept it. A self-signed
 * certificate passes only when the monitor allows it, and only if it really is
 * self-signed, in date, and issued for `host`.
 */
function certificateProblem(
	socket: tls.TLSSocket,
	host: string,
	acceptSelfSigned: boolean,
): ProbeError | undefined {
	if (socket.authorized) return undefined;
	const cert = socket.getPeerX509Certificate();
	if (acceptSelfSigned && cert && cert.issuer === cert.subject && cert.verify(cert.publicKey)) {
		const now = Date.now();
		if (now < cert.validFromDate.getTime()) return certificateError("CERT_NOT_YET_VALID", host);
		if (now > cert.validToDate.getTime()) return certificateError("CERT_HAS_EXPIRED", host);
		const issuedFor = net.isIP(host) ? cert.checkIP(host) : cert.checkHost(host);
		return issuedFor ? undefined : certificateError("ERR_TLS_CERT_ALTNAME_INVALID", host);
	}
	return certificateError(String(socket.authorizationError), host);
}

/** A distinguished-name field repeated in the certificate arrives as an array. */
function firstValue(field: string | string[] | undefined): string | undefined {
	return Array.isArray(field) ? field[0] : field;
}

function describeCertificate(socket: tls.TLSSocket): Certificate | undefined {
	const peer = socket.getPeerCertificate();
	if (!peer.valid_to) return undefined;
	return {
		expiresAt: new Date(peer.valid_to),
		issuer: firstValue(peer.issuer?.O) || firstValue(peer.issuer?.CN),
	};
}

async function resolveHost(
	host: string,
	signal: AbortSignal,
): Promise<{ addresses: LookupAddress[]; dnsMs?: number }> {
	const family = net.isIP(host);
	if (family !== 0) return { addresses: [{ address: host, family }] };

	const started = performance.now();
	try {
		const addresses = await abortable(lookup(host, { all: true, order: "verbatim" }), signal);
		return { addresses, dnsMs: performance.now() - started };
	} catch (error) {
		throw signal.aborted ? signal.reason : dnsError(host, error);
	}
}

/**
 * Opens a connection to `host`:`port` and returns it with the time each phase
 * took. Rejects with a ProbeError, or with the signal's reason once it aborts.
 */
export async function dial({
	host,
	port,
	signal,
	onPhase,
	tls: tlsOptions,
}: DialOptions): Promise<Dialed> {
	signal.throwIfAborted();
	onPhase?.("dns");
	const { addresses, dnsMs } = await resolveHost(host, signal);

	if (!privateTargetsAllowed()) {
		const blocked = addresses.find((a) => isPrivateAddress(a.address));
		if (blocked) {
			throw new ProbeError(
				blocked.address === host
					? `Blocked: ${host} is a private address`
					: `Blocked: ${host} resolves to a private address`,
			);
		}
	}

	// Hands net the vetted addresses, so it connects to nothing else.
	const vetted: net.LookupFunction = (_hostname, lookupOptions, callback) => {
		if (lookupOptions.all) callback(null, addresses);
		else callback(null, addresses[0].address, addresses[0].family);
	};

	onPhase?.("connect");
	const started = performance.now();
	const socket = tlsOptions
		? tls.connect({
				host,
				port,
				lookup: vetted,
				// SNI takes a host name; passing an IP is rejected outright.
				servername: net.isIP(host) ? undefined : host,
				// The certificate is judged below, so the owner learns why it was refused.
				rejectUnauthorized: false,
				ALPNProtocols: ["http/1.1"],
			})
		: net.connect({ host, port, lookup: vetted });
	// Without it, a small request can sit in the kernel waiting to be coalesced, which
	// would count as server time.
	socket.setNoDelay(true);

	return new Promise((resolvePromise, reject) => {
		let connected = false;

		const finish = (error?: Error) => {
			signal.removeEventListener("abort", onAbort);
			socket.off("error", onError);
			if (error) {
				socket.destroy();
				reject(error);
			}
		};
		const onAbort = () => finish(signal.reason);
		const onError = (error: Error) => {
			const code = errorCode(error);
			finish(
				connected
					? new ProbeError(`TLS handshake with ${host} failed${code ? ` (${code})` : ""}`)
					: socketError(host, port, error),
			);
		};

		signal.addEventListener("abort", onAbort, { once: true });
		socket.once("error", onError);
		socket.once("connect", () => {
			connected = true;
			const connectMs = performance.now() - started;
			if (!(socket instanceof tls.TLSSocket) || !tlsOptions) {
				finish();
				resolvePromise({ socket, dnsMs, connectMs });
				return;
			}
			onPhase?.("tls");
			socket.once("secureConnect", () => {
				const tlsMs = performance.now() - started - connectMs;
				const problem = certificateProblem(socket, host, tlsOptions.acceptSelfSigned);
				if (problem) return finish(problem);
				finish();
				resolvePromise({ socket, dnsMs, connectMs, tlsMs, cert: describeCertificate(socket) });
			});
		});
	});
}

/** The owner-facing message for a failed check, naming the phase a timeout cut short. */
export function failureMessage(
	error: unknown,
	signal: AbortSignal,
	phase: Phase,
	timeoutSeconds: number,
): string {
	if (signal.aborted) return `Timed out after ${timeoutSeconds}s ${PHASE_WORDS[phase]}`;
	if (error instanceof ProbeError) return error.message;
	const code = errorCode(error);
	return code ? `Check failed (${code})` : "Check failed";
}

export type ProbeResult = { ok: true } | { ok: false; error: string };

/** Whether a TCP connection to `host`:`port` opens within `timeoutMs`. */
export async function probeTcp(
	host: string,
	port: number,
	timeoutMs: number,
): Promise<ProbeResult> {
	const signal = AbortSignal.timeout(timeoutMs);
	let phase: Phase = "dns";
	try {
		const { socket } = await dial({ host, port, signal, onPhase: (p) => (phase = p) });
		socket.destroy();
		return { ok: true };
	} catch (error) {
		return { ok: false, error: failureMessage(error, signal, phase, timeoutMs / 1000) };
	}
}
