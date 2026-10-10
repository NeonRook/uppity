import { browser } from "$app/env";
import { polarClient } from "@polar-sh/better-auth/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

// getActions adds only checkoutEmbed, which is unused, and its declared type
// is not assignable to better-auth's client plugin. The checkout and portal
// endpoints are inferred from the server plugin.
const { getActions: _, ...polar } = polarClient();

export const authClient = createAuthClient({
	baseURL: browser ? window.location.origin : undefined,
	plugins: [organizationClient(), adminClient(), polar],
});

export const {
	signIn,
	signUp,
	signOut,
	useSession,
	organization,
	getSession,
	requestPasswordReset,
	resetPassword,
} = authClient;
