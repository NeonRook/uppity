import type { NotificationResult } from "./types";

/** POSTs `body` as JSON. Never throws; failures come back as a result. */
export async function postJson(
	url: string,
	body: unknown,
	label: string,
	init: { method?: string; headers?: Record<string, string> } = {},
): Promise<NotificationResult> {
	try {
		const response = await fetch(url, {
			method: init.method || "POST",
			headers: { "Content-Type": "application/json", ...init.headers },
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const text = await response.text();
			return { success: false, errorMessage: `${label} error: ${response.status} - ${text}` };
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			errorMessage: error instanceof Error ? error.message : `Failed to send ${label} notification`,
		};
	}
}
