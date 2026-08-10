<script lang="ts">
	import EmptyState from "$lib/components/empty-state.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { formatDateTimeRange, formatDuration, formatRelativeTime } from "$lib/format";
	import { getMaintenanceStatusBadge } from "$lib/maintenance";
	import { m } from "$lib/paraglide/messages.js";
	import { getLocale } from "$lib/paraglide/runtime";
	import type { MaintenanceWindowSummary } from "$lib/server/services/maintenance-window.service";
	import { Activity, CheckCircle2, Clock, Plus, Wrench } from "@lucide/svelte";

	let { data } = $props();

	const hasAny = $derived(
		data.active.length > 0 || data.upcoming.length > 0 || data.past.length > 0,
	);

	function monitorCount(count: number): string {
		return count === 1
			? m.maintenance_monitor_count({ count })
			: m.maintenance_monitors_count({ count });
	}
</script>

<svelte:head>
	<title>{m.maintenance_page_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{m.maintenance_page_title()}</h1>
			<p class="text-muted-foreground">{m.maintenance_page_description()}</p>
		</div>
		{#if hasAny}
			<Button href="/maintenance/new">
				<Plus class="mr-2 h-4 w-4" />
				{m.maintenance_new_button()}
			</Button>
		{/if}
	</div>

	{#snippet rows(items: MaintenanceWindowSummary[], emptyText: string, showRelative: boolean)}
		{#if items.length === 0}
			<p class="text-muted-foreground py-6 text-center text-sm">{emptyText}</p>
		{:else}
			<ul class="divide-y">
				{#each items as w (w.id)}
					{@const sb = getMaintenanceStatusBadge(w.status)}
					<li>
						<a
							href="/maintenance/{w.id}"
							class="hover:bg-muted/50 flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors"
						>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="truncate font-medium">{w.name}</span>
									<Badge variant={sb.variant} class={sb.class}>{sb.label}</Badge>
								</div>
								<div
									class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
								>
									<!-- Times and durations are readings off a clock, so they are set in
									     mono per the Measured-Value Rule. The relative phrase beside them
									     is prose, not a reading, and stays in sans. -->
									<span class="font-mono"
										>{formatDateTimeRange(w.startsAt, w.endsAt, getLocale())}</span
									>
									<span aria-hidden="true">·</span>
									<span class="font-mono" title={m.maintenance_duration_label()}>
										{formatDuration(w.startsAt, w.endsAt)}
									</span>
									{#if showRelative}
										<span aria-hidden="true">·</span>
										<span>
											{w.status === "in_progress"
												? m.maintenance_ends_relative({
														relative: formatRelativeTime(w.endsAt, getLocale()),
													})
												: m.maintenance_starts_relative({
														relative: formatRelativeTime(w.startsAt, getLocale()),
													})}
										</span>
									{/if}
								</div>
							</div>
							<Badge variant="outline">{monitorCount(w.monitorCount)}</Badge>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/snippet}

	{#if hasAny}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Activity class="h-4 w-4" />
					{m.maintenance_section_active()} ({data.active.length})
				</Card.Title>
			</Card.Header>
			<Card.Content class="px-0">
				{@render rows(data.active, m.maintenance_empty_active(), true)}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Clock class="h-4 w-4" />
					{m.maintenance_section_upcoming()} ({data.upcoming.length})
				</Card.Title>
			</Card.Header>
			<Card.Content class="px-0">
				{@render rows(data.upcoming, m.maintenance_empty_upcoming(), true)}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<CheckCircle2 class="h-4 w-4" />
					{m.maintenance_section_past()} ({data.past.length})
				</Card.Title>
			</Card.Header>
			<Card.Content class="px-0">
				{@render rows(data.past, m.maintenance_empty_past(), false)}
			</Card.Content>
		</Card.Root>
	{:else}
		<!-- One empty state, not four. With no windows at all, the three section cards
		     said "nothing here" three times and the global block said it a fourth. -->
		<EmptyState
			icon={Wrench}
			title={m.maintenance_empty_title()}
			description={m.maintenance_empty_description()}
			buttonText={m.maintenance_new_button()}
			buttonHref="/maintenance/new"
		/>
	{/if}
</div>
