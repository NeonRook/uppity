<script lang="ts">
	import { Sparkles, CreditCard, Check, LoaderCircle } from "@lucide/svelte";
	import { toast } from "svelte-sonner";

	import { authClient } from "#lib/auth-client.js";
	import CapacityCard from "#lib/components/billing/capacity-card.svelte";
	import UsageBar from "#lib/components/billing/usage-bar.svelte";
	import SettingsHeader from "#lib/components/settings-header.svelte";
	import { Alert, AlertDescription, AlertTitle } from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	let loadingPortal = $state(false);

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
		{:else if data.subscription.planId === "free"}
			<Alert>
				<Sparkles class="h-4 w-4" />
				<AlertTitle>{m.billing_paid_plans_soon_title()}</AlertTitle>
				<AlertDescription>{m.billing_paid_plans_soon_desc()}</AlertDescription>
			</Alert>
		{/if}
	{:else}
		<!-- No Organization Selected -->
		<Alert>
			<AlertDescription>
				{m.org_no_org_message()}
			</AlertDescription>
		</Alert>
	{/if}
</div>
