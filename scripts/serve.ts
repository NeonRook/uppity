/**
 * Web tier entry point: adapter-node's request handler in a plain HTTP server.
 *
 * adapter-node fixes its origin at build time, and one image serves every
 * deployment, so ORIGIN is applied here instead. Unset, the adapter derives the
 * origin from the request as it normally does.
 *
 * Mirrors the adapter's own server for HOST, PORT, KEEP_ALIVE_TIMEOUT,
 * HEADERS_TIMEOUT and graceful shutdown with SHUTDOWN_TIMEOUT. The handler
 * applies BODY_SIZE_LIMIT and the header settings itself.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";

import { shutdownTelemetry } from "../src/lib/server/telemetry.ts";
import { pinOrigin } from "./origin.ts";

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

function seconds(name: string, fallback?: number): number | undefined {
	const raw = process.env[name];
	if (!raw) return fallback;
	if (!/^\d+$/.test(raw))
		throw new Error(`${name} must be a whole number of seconds, received: ${raw}`);
	return Number(raw);
}

let pin: ReturnType<typeof pinOrigin>;
try {
	pin = pinOrigin(process.env);
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}

// After pinOrigin: the handler reads its header settings when it loads. Typed
// through unknown, since the module exists only once the app is built.
const built: unknown = await import("../build/handler.js");
const { handler } = built as { handler: Handler };

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const shutdownTimeout = seconds("SHUTDOWN_TIMEOUT", 30) ?? 30;
const keepAliveTimeout = seconds("KEEP_ALIVE_TIMEOUT");
const headersTimeout = seconds("HEADERS_TIMEOUT");

let shuttingDown = false;

const server = createServer((req, res) => {
	// Close each connection as its last request finishes, so none is reused.
	req.on("close", () => {
		if (shuttingDown) server.closeIdleConnections();
	});
	pin?.(req);
	handler(req, res, () => {
		res.statusCode = 404;
		res.end();
	});
});

if (keepAliveTimeout !== undefined) server.keepAliveTimeout = keepAliveTimeout * 1000;
if (headersTimeout !== undefined) server.headersTimeout = headersTimeout * 1000;

server.listen({ host, port }, () => {
	console.log(`Listening on http://${host}:${port}`);
});

function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;

	server.closeIdleConnections();
	const force = setTimeout(() => server.closeAllConnections(), shutdownTimeout * 1000);
	server.close(() => {
		clearTimeout(force);
		void shutdownTelemetry();
	});
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
