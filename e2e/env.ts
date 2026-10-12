import { buildUrl, requireDatabaseUrl } from "../src/lib/server/test/harness";

/** A database of its own, so a run never touches the one `pnpm dev` uses. */
export const E2E_DB = "uppity_e2e";
export const E2E_DATABASE_URL = buildUrl(requireDatabaseUrl(), E2E_DB);

export const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

export const AUTH_SECRET = "e2e-placeholder-not-a-real-secret";
