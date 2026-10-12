import { isHttpError } from "@sveltejs/kit";

/** The message to show for a rejected remote call. `HttpError` is not an `Error` subclass. */
export function errorMessage(e: unknown, fallback: string): string {
	if (isHttpError(e)) return e.body.message;
	return e instanceof Error ? e.message : fallback;
}
