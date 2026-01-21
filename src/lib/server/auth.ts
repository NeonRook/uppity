import { getRequestEvent } from "$app/server";
import {
	SESSION_EXPIRES_IN_SECONDS,
	SESSION_UPDATE_AGE_SECONDS,
	ORGANIZATION_MEMBERSHIP_LIMIT,
	ORGANIZATION_LIMIT_PER_USER,
	ORGANIZATION_CREATOR_ROLE,
} from "$lib/constants/auth";
import { db } from "$lib/server/db";
import * as authSchema from "$lib/server/db/auth-schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";

// $env/dynamic/private gets baked in at build time by svelte-adapter-bun
// Note: svelte-adapter-bun presents requests as HTTPS, so defaults must use https://
const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL || "https://localhost:3000";
const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") || [
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
		expiresIn: SESSION_EXPIRES_IN_SECONDS,
		updateAge: SESSION_UPDATE_AGE_SECONDS,
	},
	plugins: [
		organization({
			allowUserToCreateOrganization: true,
			organizationLimit: ORGANIZATION_LIMIT_PER_USER,
			creatorRole: ORGANIZATION_CREATOR_ROLE,
			membershipLimit: ORGANIZATION_MEMBERSHIP_LIMIT,
		}),
		admin(),
		sveltekitCookies(getRequestEvent),
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
