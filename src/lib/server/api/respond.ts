/** The one error shape every `/api/v1` response uses. */
export function apiError(
	status: number,
	code: string,
	message: string,
	headers?: Record<string, string>,
): Response {
	return Response.json({ error: { code, message } }, { status, headers });
}

export const notFound = (what: string): Response =>
	apiError(404, "not_found", `No ${what} with that id in this organization.`);

/** For a handler reached without a caller, which `handleApi` should make impossible. */
export const noCaller = (): Response =>
	apiError(401, "unauthorized", "Send an API key as `Authorization: Bearer <key>`.", {
		"www-authenticate": "Bearer",
	});

export const invalidRequest = (message: string): Response =>
	apiError(400, "invalid_request", message);
