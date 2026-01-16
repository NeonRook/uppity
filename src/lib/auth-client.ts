import { browser } from "$app/environment";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

// Use current origin in browser, fallback for SSR
const baseURL = browser ? window.location.origin : "http://localhost:5173";

export const authClient = createAuthClient({
	baseURL,
	plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession, organization, getSession } = authClient;
