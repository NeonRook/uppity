/**
 * TCP connection wrapper.
 * Isolates Bun.connect so tests can vi.mock this module
 * without requiring the Bun runtime.
 */
import type { Socket, TCPSocketConnectOptions } from "bun";

export function tcpConnect<Data = undefined>(
	options: TCPSocketConnectOptions<Data>,
): Promise<Socket<Data>> {
	return Bun.connect(options);
}

export type TcpSocket = Socket;
