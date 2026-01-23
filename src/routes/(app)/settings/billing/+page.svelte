<script lang="ts">
	import { page } from '$app/stores';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Sparkles, CreditCard, Check, LoaderCircle } from '@lucide/svelte';
	import { authClient } from '$lib/auth-client';
	import { m } from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import UsageBar from '$lib/components/billing/usage-bar.svelte';
	import PlanCard from '$lib/components/billing/plan-card.svelte';
	import type { Plan } from '$lib/types/plans';

	let { data } = $props();

	type BillingPeriod = 'monthly' | 'annual';

	let loadingPortal = $state(false);
	let loadingCheckout = $state<string | null>(null);
	let billingPeriod = $state<BillingPeriod>('monthly');

	// Clean up URL after showing success message
	onMount(() => {
		if (data.checkoutSuccess) {
			toast.success(m.billing_checkout_success());
			// Clean up the URL without triggering navigation
			const url = new URL($page.url);
			url.searchParams.delete('checkout');
			window.history.replaceState({}, '', url.pathname);
		}
	});

	async function openBillingPortal() {
		loadingPortal = true;
		try {
			const { data: portalData, error } = await authClient.customer.portal();
			if (error) {
				toast.error(m.billing_portal_error());
				return;
			}
			if (portalData?.url) {
				window.location.href = portalData.url;
			}
		} catch {
			toast.error(m.billing_portal_error());
		} finally {
			loadingPortal = false;
		}
	}

	async function startCheckout(plan: Plan) {
		if (!data.organizationId) {
			toast.error('No active organization');
			return;
		}

		loadingCheckout = plan.id;
		try {
			// Map plan ID and billing period to Polar product slug
			let slug: string = plan.id;
			if (plan.id === 'pro') {
				slug = billingPeriod === 'annual' ? 'pro-annual' : 'pro-monthly';
			}

			const { data: checkoutData, error } = await authClient.checkout({
				slug,
				referenceId: data.organizationId
			});

			if (error) {
				toast.error(m.billing_checkout_error());
				return;
			}
			if (checkoutData?.url) {
				window.location.href = checkoutData.url;
			}
		} catch {
			toast.error(m.billing_checkout_error());
		} finally {
			loadingCheckout = null;
		}
	}

	function getStatusBadgeVariant(
		status: string | null
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'active':
				return 'default';
			case 'trialing':
				return 'secondary';
			case 'past_due':
				return 'destructive';
			case 'canceled':
				return 'outline';
			default:
				return 'secondary';
		}
	}

	function getStatusLabel(status: string | null): string {
		switch (status) {
			case 'active':
				return m.billing_status_active();
			case 'trialing':
				return m.billing_status_trialing();
			case 'past_due':
				return m.billing_status_past_due();
			case 'canceled':
				return m.billing_status_canceled();
			default:
				return status ?? '';
		}
	}
</script>

<svelte:head>
	<title>{m.billing_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<div>
		<Breadcrumb.Root class="mb-2">
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/settings">{m.nav_settings()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.settings_billing()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="text-3xl font-bold tracking-tight">{m.billing_title()}</h1>
		<p class="text-muted-foreground">{m.billing_subtitle()}</p>
	</div>

	{#if data.selfHosted}
		<!-- Self-Hosted Mode -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3">
					<div class="rounded-full bg-primary/10 p-2">
						<Sparkles class="h-5 w-5 text-primary" />
					</div>
					<div>
						<Card.Title class="flex items-center gap-2">
							{m.billing_self_hosted_title()}
							<Badge variant="secondary">
								<Check class="mr-1 h-3 w-3" />
								All Features
							</Badge>
						</Card.Title>
						<Card.Description>{m.billing_self_hosted_desc()}</Card.Description>
					</div>
				</div>
			</Card.Header>
		</Card.Root>
	{:else if data.subscription}
		<!-- Current Plan Card -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-primary/10 p-2">
							<CreditCard class="h-5 w-5 text-primary" />
						</div>
						<div>
							<Card.Title class="flex items-center gap-2">
								{m.billing_current_plan()}: {data.currentPlanName}
								<Badge variant={getStatusBadgeVariant(data.subscription.status)}>
									{getStatusLabel(data.subscription.status)}
								</Badge>
							</Card.Title>
							{#if data.subscription.currentPeriodEnd}
								<Card.Description>
									{m.billing_period_ends({
										date: new Date(data.subscription.currentPeriodEnd).toLocaleDateString()
									})}
								</Card.Description>
							{/if}
						</div>
					</div>
					{#if data.subscription.hasCustomerAccount}
						<Button variant="outline" onclick={openBillingPortal} disabled={loadingPortal}>
							{#if loadingPortal}
								<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
							{/if}
							{m.billing_manage_subscription()}
						</Button>
					{/if}
				</div>
			</Card.Header>
			{#if data.usage}
				<Card.Content>
					<div class="space-y-4">
						<h4 class="text-sm font-medium">{m.billing_usage()}</h4>
						<div class="grid gap-4 sm:grid-cols-2">
							<UsageBar
								current={data.usage.monitors.current}
								limit={data.usage.monitors.limit}
								label="monitors"
							/>
							<UsageBar
								current={data.usage.statusPages.current}
								limit={data.usage.statusPages.limit}
								label="statusPages"
							/>
						</div>
					</div>
				</Card.Content>
			{/if}
		</Card.Root>

		<!-- Plan Comparison -->
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">{m.billing_compare_plans()}</h2>
				<div class="flex items-center gap-2 rounded-lg bg-muted p-1">
					<button
						type="button"
						class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {billingPeriod ===
						'monthly'
							? 'bg-background shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (billingPeriod = 'monthly')}
					>
						{m.billing_monthly()}
					</button>
					<button
						type="button"
						class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {billingPeriod ===
						'annual'
							? 'bg-background shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (billingPeriod = 'annual')}
					>
						{m.billing_annual()}
						<Badge variant="secondary" class="text-xs"
							>{m.billing_save_percent({ percent: 17 })}</Badge
						>
					</button>
				</div>
			</div>
			<div class="grid gap-4 md:grid-cols-3">
				{#each data.plans as plan (plan.id)}
					<PlanCard
						{plan}
						{billingPeriod}
						isCurrentPlan={plan.id === data.subscription.planId}
						onUpgrade={() => startCheckout(plan)}
						loading={loadingCheckout === plan.id}
						disabled={loadingCheckout !== null && loadingCheckout !== plan.id}
					/>
				{/each}
			</div>
		</div>
	{:else}
		<!-- No Organization Selected -->
		<Alert>
			<AlertDescription>
				{m.org_no_org_message()}
			</AlertDescription>
		</Alert>
	{/if}
</div>
