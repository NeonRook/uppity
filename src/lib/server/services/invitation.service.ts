import { APIError } from "better-auth/api";
import { and, eq, gt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { invitation, member, organization, user } from "#lib/server/db/auth-schema.js";
import type { Db } from "#lib/server/db/index.js";
import { logger } from "#lib/server/logger/index.js";
import type { TeamInvitation } from "#lib/server/subscriber-email.js";

import type { EmailChannelService, Requester } from "./email-channel.service";
import type { MailRefusal } from "./mail-reputation.service";

export type DeliveryOutcome =
	| "sent"
	| "no_mail"
	| "unverified"
	| "opted_out"
	| "too_soon"
	| "capped"
	| "failed"
	| MailRefusal;

export interface InvitationSummary {
	id: string;
	organizationName: string;
	/** Null while the inviter's address is unverified, since then it is text of their choosing. */
	invitedBy: string | null;
}

export type InvitationView =
	| { state: "invalid" | "other_account" | "unverified" }
	| { state: "pending"; invitation: InvitationSummary };

const inviter = alias(user, "inviter");

/** Team invitations, whose emails go to addresses that never agreed to mail. */
export class InvitationService {
	constructor(
		private db: Db,
		private sends: Pick<EmailChannelService, "claimInvitationSend" | "releaseSend">,
		private send: ((invitation: TeamInvitation) => Promise<void>) | null,
	) {}

	/**
	 * Emails a just-created invitation. One that nobody received is deleted, so it does not
	 * hold a seat under the plan's member limit.
	 */
	async deliver(
		created: { id: string; email: string; organizationId: string },
		from: Requester,
	): Promise<DeliveryOutcome> {
		const outcome = await this.attempt(created, from);
		if (outcome !== "sent") {
			await this.db.delete(invitation).where(eq(invitation.id, created.id));
		}
		return outcome;
	}

	private async attempt(
		{ id, email, organizationId }: { id: string; email: string; organizationId: string },
		from: Requester,
	): Promise<DeliveryOutcome> {
		if (!this.send) return "no_mail";
		if (!from.emailVerified) return "unverified";

		const claim = await this.sends.claimInvitationSend(organizationId, email);
		if (claim.refused) return claim.refused;

		try {
			await this.send({ email, invitationId: id, invitedBy: from.email });
		} catch (error) {
			logger.error({ invitation_id: id, error }, "Failed to send invitation email");
			await this.sends.releaseSend(claim.sendId);
			return "failed";
		}
		return "sent";
	}

	/**
	 * Runs `accept` on a live invitation, one at a time per organization: better-auth counts
	 * members and adds one without a lock, so two accepts could both take the last seat. The
	 * lock is held until `accept` has committed. A concurrent accept is refused rather than
	 * queued, since a waiter would hold a pooled connection.
	 */
	async accept(id: string, accept: () => Promise<unknown>): Promise<void> {
		const [row] = await this.pending(eq(invitation.id, id));
		if (!row) throw new APIError("BAD_REQUEST", { message: "Invitation not found" });

		await this.db.transaction(async (tx) => {
			const [{ locked }] = await tx.execute<{ locked: boolean }>(
				sql`SELECT pg_try_advisory_xact_lock(hashtext(${`seats:${row.organizationId}`})) AS locked`,
			);
			if (!locked) throw new APIError("CONFLICT", { message: "Another accept is in progress" });
			await accept();
		});
	}

	/**
	 * What `reader` may see of an invitation. The id travels in an email, so holding it proves
	 * nothing: only a verified account with the invited address learns the organization.
	 */
	async viewFor(id: string, reader: Requester): Promise<InvitationView> {
		const [row] = await this.pending(eq(invitation.id, id));
		if (!row) return { state: "invalid" };
		if (row.email.toLowerCase() !== reader.email.toLowerCase()) return { state: "other_account" };
		if (!reader.emailVerified) return { state: "unverified" };
		return { state: "pending", invitation: summarize(row) };
	}

	/** Pending invitations to `reader`, none until their address is verified. */
	async pendingFor(reader: Requester): Promise<InvitationSummary[]> {
		if (!reader.emailVerified) return [];
		const rows = await this.pending(sql`lower(${invitation.email}) = lower(${reader.email})`);
		return rows.map(summarize);
	}

	private pending(match: SQL) {
		return (
			this.db
				.select({
					id: invitation.id,
					email: invitation.email,
					organizationId: invitation.organizationId,
					organizationName: organization.name,
					inviterEmail: inviter.email,
					inviterVerified: inviter.emailVerified,
				})
				.from(invitation)
				.innerJoin(organization, eq(organization.id, invitation.organizationId))
				.innerJoin(inviter, eq(inviter.id, invitation.inviterId))
				// An invitation dies with its sender's membership, so a removed admin cannot let
				// themselves back in through one sent beforehand.
				.innerJoin(
					member,
					and(
						eq(member.userId, invitation.inviterId),
						eq(member.organizationId, invitation.organizationId),
					),
				)
				.where(and(match, eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date())))
		);
	}
}

function summarize(row: {
	id: string;
	organizationName: string;
	inviterEmail: string;
	inviterVerified: boolean;
}): InvitationSummary {
	return {
		id: row.id,
		organizationName: row.organizationName,
		invitedBy: row.inviterVerified ? row.inviterEmail : null,
	};
}
