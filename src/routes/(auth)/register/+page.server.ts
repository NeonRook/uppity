import { turnstileSiteKey } from "#lib/server/turnstile.js";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => ({ turnstileSiteKey: turnstileSiteKey() });
