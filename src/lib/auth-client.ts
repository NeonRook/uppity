import { browser } from "$app/environment";
import { polarClient } from "@polar-sh/better-auth/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
	baseURL: browser ? window.location.origin : undefined,
	plugins: [organizationClient(), adminClient(), polarClient()],
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
