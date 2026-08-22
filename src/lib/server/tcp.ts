/**
 * Reachability probes for TCP and TLS monitor checks.
 *
 * Connection setup lives here so the socket lifecycle — connect, time out,
 * tear down — is written once rather than at each call site. A probe always
 * settles: a monitor that hangs reports nothing, which is worse than one that
 * reports down.
 */
import net from "node:net";
import tls from "node:tls";
import type { PeerCertificate } from "node:tls";

export type ProbeResult =
	| { ok: true; cert?: PeerCertificate }
	| { ok: false; error: string; timedOut: boolean };

const CONNECTION_FAILED = "Connection failed";

/**
 * Races a socket's ready event against a deadline, settling on whichever
 * comes first and destroying the socket either way.
 */
function runProbe(
	createSocket: () => net.Socket,
	readyEvent: "connect" | "secureConnect",
	timeoutMs: number,
	describe: (socket: net.Socket) => ProbeResult,
): Promise<ProbeResult> {
	return new Promise((resolve) => {
		const socket = createSocket();
		let settled = false;

		const settle = (result: ProbeResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			resolve(result);
		};

		const timer = setTimeout(
			() => settle({ ok: false, error: "Connection timed out", timedOut: true }),
			timeoutMs,
		);

		socket.once(readyEvent, () => settle(describe(socket)));
		socket.once("error", (err: Error) =>
			settle({ ok: false, error: err.message || CONNECTION_FAILED, timedOut: false }),
		);
	});
}

export function probeTcp(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
	return runProbe(
		() => net.connect({ host, port }),
		"connect",
		timeoutMs,
		() => ({ ok: true }),
	);
}

/**
 * Completes a TLS handshake and returns the peer certificate. Certificate
 * validation is off because the point is to report on expired and otherwise
 * broken certificates, not to refuse to look at them.
 */
export function probeTls(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
	return runProbe(
		() =>
			tls.connect({
				host,
				port,
				// SNI takes a host name; passing an IP is rejected outright.
				servername: net.isIP(host) ? undefined : host,
				rejectUnauthorized: false,
			}),
		"secureConnect",
		timeoutMs,
		(socket) => ({ ok: true, cert: (socket as tls.TLSSocket).getPeerCertificate() }),
	);
}
