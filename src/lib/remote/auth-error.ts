import { error } from "@sveltejs/kit";
import { APIError } from "better-auth/api";

/** Relays a better-auth refusal with its status and message; rethrows anything else. */
export function relayAuthError(err: unknown): never {
	if (err instanceof APIError) error(err.statusCode, err.body?.message ?? err.message);
	throw err;
}
