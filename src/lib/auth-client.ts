import { browser } from "$app/environment";
import { polarClient } from "@polar-sh/better-auth/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

// Use current origin in browser, fallback for SSR
const fallbackUrl = import.meta.env.VITE_BETTER_AUTH_URL || "http://localhost:5173";
const baseURL = browser ? window.location.origin : fallbackUrl;

export const authClient = createAuthClient({
	baseURL,
	plugins: [organizationClient(), adminClient(), polarClient()],
});

export const { signIn, signUp, signOut, useSession, organization, getSession } = authClient;
