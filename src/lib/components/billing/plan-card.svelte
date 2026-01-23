<script lang="ts">
	import type { Plan } from '$lib/types/plans';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { Check, LoaderCircle } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';

	type BillingPeriod = 'monthly' | 'annual';

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
		billingPeriod = 'monthly',
		onUpgrade,
		loading = false,
		disabled = false
	}: Props = $props();

	const priceInfo = $derived.by(() => {
		// Free plan
		if (plan.monthlyPriceCents === 0) {
			return { display: m.billing_free(), suffix: '', isFree: true };
		}
		// Enterprise (custom pricing)
		if (plan.monthlyPriceCents === null || plan.annualPriceCents === null) {
			return { display: m.billing_custom_pricing(), suffix: '', isFree: false };
		}
		// Paid plan
		if (billingPeriod === 'annual') {
			const monthlyEquivalent = plan.annualPriceCents / 12 / 100;
			return {
				display: `$${monthlyEquivalent.toFixed(0)}`,
				suffix: m.billing_per_month(),
				isFree: false
			};
		}
		return {
			display: `$${(plan.monthlyPriceCents / 100).toFixed(0)}`,
			suffix: m.billing_per_month(),
			isFree: false
		};
	});

	const features = $derived.by(() => {
		const f: string[] = [];
		const { limits } = plan;

		// Monitors
		if (limits.monitors === -1) {
			f.push(m.billing_features_monitors_unlimited());
		} else {
			f.push(m.billing_features_monitors({ count: limits.monitors }));
		}

		// Status Pages
		if (limits.statusPages === -1) {
			f.push(m.billing_features_status_pages_unlimited());
		} else {
			f.push(m.billing_features_status_pages({ count: limits.statusPages }));
		}

		// Check interval
		f.push(m.billing_features_check_interval({ seconds: limits.checkIntervalSeconds }));

		// Data retention
		if (limits.retentionDays === -1) {
			f.push(m.billing_features_retention_unlimited());
		} else {
			f.push(m.billing_features_retention({ days: limits.retentionDays }));
		}

		// Notifications
		if (limits.notificationChannels.length > 1) {
			f.push(m.billing_features_all_notifications());
		} else {
			f.push(m.billing_features_email_notifications());
		}

		// Premium features
		if (limits.customDomains) {
			f.push(m.billing_features_custom_domains());
		}
		if (limits.apiAccess === 'full') {
			f.push(m.billing_features_api_access());
		}
		if (limits.sso) {
			f.push(m.billing_features_sso());
		}
		if (limits.auditLogs) {
			f.push(m.billing_features_audit_logs());
		}

		return f;
	});

	const isEnterprise = $derived(plan.id === 'enterprise');
</script>

<Card.Root class={isCurrentPlan ? 'border-primary' : ''}>
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
				<span class="text-sm font-normal text-muted-foreground">{priceInfo.suffix}</span>
			{/if}
		</div>
	</Card.Header>
	<Card.Content class="space-y-4">
		<ul class="space-y-2">
			{#each features as feature, i (i)}
				<li class="flex items-center gap-2 text-sm">
					<Check class="h-4 w-4 text-primary" />
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
		{:else if isEnterprise}
			<Button
				class="w-full"
				variant="outline"
				href="mailto:sales@uppity.app"
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
