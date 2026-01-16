// SSE connection management for real-time updates

// Store active SSE connections by organization ID
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

export function addConnection(organizationId: string, controller: ReadableStreamDefaultController) {
	if (!connections.has(organizationId)) {
		connections.set(organizationId, new Set());
	}
	connections.get(organizationId)!.add(controller);
}

export function removeConnection(
	organizationId: string,
	controller: ReadableStreamDefaultController,
) {
	connections.get(organizationId)?.delete(controller);
	if (connections.get(organizationId)?.size === 0) {
		connections.delete(organizationId);
	}
}

export function broadcastMonitorUpdate(organizationId: string, data: unknown) {
	const orgConnections = connections.get(organizationId);
	if (orgConnections) {
		const message = `data: ${JSON.stringify(data)}\n\n`;
		for (const controller of orgConnections) {
			try {
				controller.enqueue(new TextEncoder().encode(message));
			} catch {
				// Connection closed, will be cleaned up
			}
		}
	}
}

export function getConnectionCount(organizationId: string): number {
	return connections.get(organizationId)?.size ?? 0;
}
