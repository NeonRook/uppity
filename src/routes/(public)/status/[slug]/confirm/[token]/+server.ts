import { redirect } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

/** Confirmation links that carry the page's slug stay valid until they expire. */
export const GET: RequestHandler = ({ params }) => redirect(307, `/status/confirm/${params.token}`);
