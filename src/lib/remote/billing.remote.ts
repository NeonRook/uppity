import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { isSelfHosted } from "#lib/constants/plans.js";
import { db } from "#lib/server/db/index.js";
import { logger } from "#lib/server/logger/index.js";
import { MeterService } from "#lib/server/services/meter.service.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

const blocksSchema = v.object({
	blocks: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

/**
 * Sets the active organization's capacity blocks. An increase applies and is reported
 * to Polar at once; a reduction is scheduled for the end of the billing period.
 *
 * Refusals the customer can act on come back as `{ ok: false, reason }` for the page to
 * explain. Callers who may not reach this at all get an HTTP error.
 */
export const setCapacityBlocks = command(blocksSchema, async ({ blocks }) => {
	const { locals } = getRequestEvent();
	const organizationId = locals.session?.activeOrganizationId;
	if (!locals.user || !organizationId) {
		error(401, "Not authenticated");
	}
	if (isSelfHosted()) {
		error(404, "Not found");
	}
	if (!(await subscriptionService.canManageBilling(organizationId, locals.user.id))) {
		error(403, "Only owners and admins can change capacity");
	}

	const result = await subscriptionService.setBlocks(organizationId, blocks);
	if (!result.ok && result.reason === "multi_org_customer") {
		// The blocks belong to whoever paid, who may not be this caller. Name the other
		// organization only to someone who is a member of it.
		const { id, name } = result.organization;
		const isMember = (await subscriptionService.memberRole(id, locals.user.id)) !== null;
		return { ok: false as const, reason: result.reason, organizationName: isMember ? name : null };
	}
	if (!result.ok) return result;

	// A failed report is not rolled back: the daily heartbeat repairs it within a day,
	// and until then the risk is revenue lost, never a customer charged wrongly.
	const { polarCustomerId } = result.subscription;
	if (polarCustomerId) {
		const report = await new MeterService(db).reportBlocks(polarCustomerId);
		if (!report.ok) {
			logger.error(
				{
					organization_id: organizationId,
					polar_customer_id: polarCustomerId,
					reason: report.reason,
				},
				"Capacity blocks changed but not reported to Polar",
			);
		}
	}

	return {
		ok: true as const,
		blocks: result.subscription.blocks,
		scheduledBlocks: result.subscription.scheduledBlocks,
	};
});
