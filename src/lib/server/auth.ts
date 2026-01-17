import { getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as authSchema from "$lib/server/db/auth-schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";

// Use Bun.env directly to ensure runtime resolution
// $env/dynamic/private gets baked in at build time by svelte-adapter-bun
// Note: svelte-adapter-bun presents requests as HTTPS, so defaults must use https://
const secret = Bun.env.BETTER_AUTH_SECRET;
const baseURL = Bun.env.BETTER_AUTH_URL || "https://localhost:3000";
const trustedOrigins = Bun.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") || [
	"https://localhost:3000",
];

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
	secret: secret,
	baseURL: baseURL,
	trustedOrigins: trustedOrigins,
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
		admin(),
		sveltekitCookies(getRequestEvent),
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
