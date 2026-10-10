<script lang="ts">
	import { Check, LoaderCircle } from "@lucide/svelte";

	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { formatUsdCents } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";
	import type { Plan } from "#lib/types/plans.js";

	type BillingPeriod = "monthly" | "annual";

	interface Props {
		plan: Plan;
		isCurrentPlan: boolean;
		billingPeriod?: BillingPeriod;
		onUpgrade?: () => void;
		loading?: boolean;
		disabled?: boolean;
	}

	let {
		plan,
		isCurrentPlan,
		billingPeriod = "monthly",
		onUpgrade,
		loading = false,
		disabled = false,
	}: Props = $props();

	const priceInfo = $derived.by(() => {
		// Free plan
		if (plan.monthlyPriceCents === 0) {
			return { display: m.billing_free(), suffix: "", note: "" };
		}
		// Negotiated plans carry no list price
		if (plan.monthlyPriceCents === null || plan.annualPriceCents === null) {
			return { display: m.billing_custom_pricing(), suffix: "", note: "" };
		}
		// Annual keeps the monthly-equivalent headline so the figure stays comparable
		// across the toggle, and states the real charge underneath — the customer is
		// billed once a year, not monthly.
		if (billingPeriod === "annual") {
			return {
				display: formatUsdCents(plan.annualPriceCents / 12),
				suffix: m.billing_per_month(),
				note: m.billing_billed_annually({ amount: formatUsdCents(plan.annualPriceCents) }),
			};
		}
		return {
			display: formatUsdCents(plan.monthlyPriceCents),
			suffix: m.billing_per_month(),
			note: "",
		};
	});

	const features = $derived.by(() => {
		const { limits } = plan;
		return [
			limits.monitors === -1
				? m.billing_features_monitors_unlimited()
				: m.billing_features_monitors({ count: limits.monitors }),
			limits.statusPages === -1
				? m.billing_features_status_pages_unlimited()
				: m.billing_features_status_pages({ count: limits.statusPages }),
			m.billing_features_check_interval({ seconds: limits.checkIntervalSeconds }),
			limits.retentionDays === -1
				? m.billing_features_retention_unlimited()
				: m.billing_features_retention({ days: limits.retentionDays }),
			limits.teamMembers === -1
				? m.billing_features_team_members_unlimited()
				: m.billing_features_team_members({ count: limits.teamMembers }),
			limits.notificationChannels.length > 1
				? m.billing_features_all_notifications()
				: m.billing_features_email_notifications(),
			...(limits.customDomains ? [m.billing_features_custom_domains()] : []),
			...(limits.apiAccess === "full" ? [m.billing_features_api_access()] : []),
			...(limits.sso ? [m.billing_features_sso()] : []),
			...(limits.auditLogs ? [m.billing_features_audit_logs()] : []),
		];
	});

	// Dedicated implies provisioning isolated infrastructure, so it is never a
	// self-serve checkout. Negotiated plans (null pricing) are contact-sales too.
	const isContactSales = $derived(plan.id === "dedicated" || plan.monthlyPriceCents === null);
</script>

<Card.Root class={isCurrentPlan ? "border-primary" : ""}>
	<Card.Header>
		<div class="flex items-center justify-between">
			<Card.Title>{plan.name}</Card.Title>
			{#if isCurrentPlan}
				<Badge>{m.billing_current()}</Badge>
			{/if}
		</div>
		<div class="text-2xl font-bold">
			{priceInfo.display}
			{#if priceInfo.suffix}
				<span class="text-muted-foreground text-sm font-normal">{priceInfo.suffix}</span>
			{/if}
		</div>
		{#if priceInfo.note}
			<div class="text-muted-foreground text-sm">{priceInfo.note}</div>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-4">
		<ul class="space-y-2">
			{#each features as feature, i (i)}
				<li class="flex items-center gap-2 text-sm">
					<Check class="text-primary h-4 w-4" />
					<span>{feature}</span>
				</li>
			{/each}
		</ul>
	</Card.Content>
	<Card.Footer>
		{#if isCurrentPlan}
			<Button class="w-full" variant="outline" disabled>
				{m.billing_current()}
			</Button>
		{:else if isContactSales}
			<Button
				class="w-full"
				variant="outline"
				href="mailto:sales@uppity.cloud"
				disabled={loading || disabled}
			>
				{m.billing_contact_sales()}
			</Button>
		{:else}
			<Button class="w-full" onclick={onUpgrade} disabled={loading || disabled}>
				{#if loading}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				{m.billing_upgrade()}
			</Button>
		{/if}
	</Card.Footer>
</Card.Root>
