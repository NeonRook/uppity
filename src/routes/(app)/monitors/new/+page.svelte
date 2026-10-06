<script lang="ts">
	import { AlertTriangle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import MonitorForm from "#lib/components/monitor-form.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { CHECK_INTERVALS } from "#lib/constants/monitor.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();
	const form = superForm(untrack(() => data.form));

	// Usage limits from parent layout (self-hosted has no limits)
	const usageLimits = $derived(data.usageLimits);
	const canAddMonitor = $derived(data.selfHosted || (usageLimits?.monitors.canAdd ?? true));
	const minCheckInterval = $derived(
		data.selfHosted ? 0 : (usageLimits?.features.minCheckIntervalSeconds ?? 60),
	);

	// Filter intervals based on plan
	const availableIntervals = $derived(
		CHECK_INTERVALS.filter((i) => Number(i.value) >= minCheckInterval),
	);
</script>

<svelte:head>
	<title>{m.monitor_new_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader
		backHref="/monitors"
		title={m.monitor_new_title()}
		description={m.monitor_new_subtitle()}
	/>

	<MonitorForm
		superform={form}
		mode="create"
		cancelHref="/monitors"
		intervals={availableIntervals}
		submitDisabled={!canAddMonitor}
	>
		{#snippet notice()}
			{#if !canAddMonitor}
				<Alert class="mb-6">
					<AlertTriangle class="h-4 w-4" />
					<AlertDescription>
						<p>
							{m.monitors_limit_reached({ limit: usageLimits?.monitors.limit ?? 0 })}
							<a href="/settings/billing" class="underline underline-offset-4">
								{m.monitors_limit_add_capacity()}
							</a>
						</p>
					</AlertDescription>
				</Alert>
			{/if}
		{/snippet}
	</MonitorForm>
</div>
