<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { getMaintenanceStatusBadge } from '$lib/maintenance';
	import { m } from '$lib/paraglide/messages.js';
	import { Activity, CheckCircle2, Clock, Plus, Wrench } from '@lucide/svelte';
	import type { MaintenanceWindowSummary } from '$lib/server/services/maintenance-window.service';

	let { data } = $props();

	function formatRange(start: Date, end: Date): string {
		const fmt = new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
		return `${fmt.format(new Date(start))} → ${fmt.format(new Date(end))}`;
	}

	function rowClick(id: string) {
		goto(`/maintenance/${id}`);
	}
</script>

<svelte:head>
	<title>{m.maintenance_page_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.maintenance_page_title()}</h1>
			<p class="text-muted-foreground">{m.maintenance_page_description()}</p>
		</div>
		<Button href="/maintenance/new">
			<Plus class="mr-2 h-4 w-4" />
			{m.maintenance_new_button()}
		</Button>
	</div>

	{#snippet rows(items: MaintenanceWindowSummary[], emptyText: string)}
		{#if items.length === 0}
			<p class="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
		{:else}
			<ul class="divide-y">
				{#each items as w (w.id)}
					{@const sb = getMaintenanceStatusBadge(w.status)}
					<li>
						<button
							type="button"
							class="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted"
							onclick={() => rowClick(w.id)}
						>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="truncate font-medium">{w.name}</span>
									<Badge variant={sb.variant}>{sb.label}</Badge>
								</div>
								<div class="mt-1 text-xs text-muted-foreground">
									{formatRange(w.startsAt, w.endsAt)}
								</div>
							</div>
							<Badge variant="outline">
								{m.maintenance_monitor_count({ count: w.monitorCount })}
							</Badge>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/snippet}

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Activity class="h-4 w-4" />
				{m.maintenance_section_active()} ({data.active.length})
			</Card.Title>
		</Card.Header>
		<Card.Content class="px-0">
			{@render rows(data.active, m.maintenance_empty_active())}
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
			{@render rows(data.upcoming, m.maintenance_empty_upcoming())}
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
			{@render rows(data.past, m.maintenance_empty_past())}
		</Card.Content>
	</Card.Root>

	{#if data.active.length === 0 && data.upcoming.length === 0 && data.past.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
			<Wrench class="h-8 w-8" />
			<p>{m.maintenance_empty_global()}</p>
		</div>
	{/if}
</div>
