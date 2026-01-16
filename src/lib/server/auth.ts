import { getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as authSchema from "$lib/server/db/auth-schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";

// Use Bun.env directly to ensure runtime resolution
// $env/dynamic/private gets baked in at build time by svelte-adapter-bun
const BETTER_AUTH_SECRET = Bun.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = Bun.env.BETTER_AUTH_URL || "http://localhost:3000";
const BETTER_AUTH_TRUSTED_ORIGINS = Bun.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") || [
	"http://localhost:3000",
];

console.log("[AUTH] Initializing with baseURL:", BETTER_AUTH_URL);
console.log("[AUTH] Trusted origins:", BETTER_AUTH_TRUSTED_ORIGINS);

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: authSchema.user,
			session: authSchema.session,
			account: authSchema.account,
			verification: authSchema.verification,
			organization: authSchema.organization,
			member: authSchema.member,
			invitation: authSchema.invitation,
		},
	}),
	secret: BETTER_AUTH_SECRET,
	baseURL: BETTER_AUTH_URL,
	trustedOrigins: BETTER_AUTH_TRUSTED_ORIGINS,
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24, // 1 day
	},
	plugins: [
		organization({
			allowUserToCreateOrganization: true,
			organizationLimit: 5,
			creatorRole: "owner",
			membershipLimit: 100,
		}),
		sveltekitCookies(getRequestEvent),
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
