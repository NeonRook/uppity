import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BETTER_AUTH_URL || "http://localhost:5173",
	plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession, organization, getSession } = authClient;
