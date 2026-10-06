<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { Sparkles, CreditCard, Check, LoaderCircle } from "@lucide/svelte";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { authClient } from "#lib/auth-client.js";
	import CapacityCard from "#lib/components/billing/capacity-card.svelte";
	import PlanCard from "#lib/components/billing/plan-card.svelte";
	import UsageBar from "#lib/components/billing/usage-bar.svelte";
	import SettingsHeader from "#lib/components/settings-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { MONITOR_BLOCK_SIZE, UPPITY_PLAN } from "#lib/constants/plans.js";
	import { m } from "#lib/paraglide/messages.js";
	import type { Plan } from "#lib/types/plans.js";

	let { data } = $props();

	type BillingPeriod = "monthly" | "annual";

	let loadingPortal = $state(false);
	let loadingCheckout = $state<string | null>(null);
	let billingPeriod = $state<BillingPeriod>("monthly");

	const uppityPlan = $derived(data.plans.find((plan) => plan.id === "uppity"));

	onMount(() => {
		if (data.checkoutSuccess) {
			toast.success(m.billing_checkout_success());
			// Drop the checkout query parameter so a reload does not repeat the toast
			goto(page.url.pathname, { replaceState: true });
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
			toast.error("No active organization");
			return;
		}

		loadingCheckout = plan.id;
		try {
			// Map plan ID and billing period to Polar product slug. Dedicated is
			// contact-sales and never reaches this path.
			const slug = billingPeriod === "annual" ? `${plan.id}-annual` : `${plan.id}-monthly`;

			const { data: checkoutData, error } = await authClient.checkout({
				slug,
				reference_id: data.organizationId,
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

	const statusBadges: Partial<
		Record<
			string,
			{ variant: "default" | "secondary" | "destructive" | "outline"; label: () => string }
		>
	> = {
		active: { variant: "default", label: m.billing_status_active },
		trialing: { variant: "secondary", label: m.billing_status_trialing },
		past_due: { variant: "destructive", label: m.billing_status_past_due },
		canceled: { variant: "outline", label: m.billing_status_canceled },
	};
</script>

<svelte:head>
	<title>{m.billing_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<SettingsHeader
		section={m.settings_billing()}
		title={m.billing_title()}
		description={m.billing_subtitle()}
	/>

	{#if data.selfHosted}
		<!-- Self-Hosted Mode -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3">
					<div class="bg-primary/10 rounded-full p-2">
						<Sparkles class="text-primary h-5 w-5" />
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
						<div class="bg-primary/10 rounded-full p-2">
							<CreditCard class="text-primary h-5 w-5" />
						</div>
						<div>
							<Card.Title class="flex items-center gap-2">
								{m.billing_current_plan()}: {data.currentPlanName}
								{@const statusBadge = statusBadges[data.subscription.status ?? ""]}
								<Badge variant={statusBadge?.variant ?? "secondary"}>
									{statusBadge?.label() ?? data.subscription.status ?? ""}
								</Badge>
							</Card.Title>
							{#if data.subscription.currentPeriodEnd}
								<Card.Description>
									{m.billing_period_ends({
										date: new Date(data.subscription.currentPeriodEnd).toLocaleDateString(),
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
							<!-- The capacity card carries the monitor bar when it is shown. -->
							{#if !data.capacity}
								<UsageBar
									current={data.usage.monitors.current}
									limit={data.usage.monitors.limit}
									label="monitors"
								/>
							{/if}
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

		{#if data.capacity && data.usage}
			<CapacityCard
				blocks={data.capacity.blocks}
				scheduledBlocks={data.capacity.scheduledBlocks}
				annual={data.capacity.annual}
				canManage={data.capacity.canManage}
				periodEnd={data.subscription.currentPeriodEnd}
				monitorsUsed={data.usage.monitors.current}
			/>
		{:else if data.subscription.planId === "free" && data.canManageBilling && uppityPlan}
			<Card.Root>
				<Card.Header>
					<Card.Title>
						{m.billing_block_upgrade_title({ count: data.usage?.monitors.limit ?? 0 })}
					</Card.Title>
					<Card.Description>
						{m.billing_block_upgrade_desc({
							included: UPPITY_PLAN.limits.monitors,
							size: MONITOR_BLOCK_SIZE,
						})}
					</Card.Description>
				</Card.Header>
				<Card.Footer>
					<Button onclick={() => startCheckout(uppityPlan)} disabled={loadingCheckout !== null}>
						{#if loadingCheckout === uppityPlan.id}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						{m.billing_block_upgrade_action()}
					</Button>
				</Card.Footer>
			</Card.Root>
		{/if}

		<!-- Plan Comparison -->
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">{m.billing_compare_plans()}</h2>
				<div class="bg-muted flex items-center gap-2 rounded-lg p-1">
					<button
						type="button"
						class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors {billingPeriod ===
						'monthly'
							? 'border-input bg-background'
							: 'text-muted-foreground hover:text-foreground border-transparent'}"
						onclick={() => (billingPeriod = "monthly")}>{m.billing_monthly()}</button
					>

					<button
						type="button"
						class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors {billingPeriod ===
						'annual'
							? 'border-input bg-background'
							: 'text-muted-foreground hover:text-foreground border-transparent'}"
						onclick={() => (billingPeriod = "annual")}
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
						disabled={!data.canManageBilling ||
							(loadingCheckout !== null && loadingCheckout !== plan.id)}
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
