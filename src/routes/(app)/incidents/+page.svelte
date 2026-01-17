<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, TriangleAlert, Trash2 } from '@lucide/svelte';
	import { getStatusInfo, getImpactInfo, formatIncidentDate } from '$lib/incidents';
	import EmptyState from '$lib/components/empty-state.svelte';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';

	let { data } = $props();

	let deleteIncidentId = $state<string | null>(null);

	function getDuration(startedAt: Date, resolvedAt: Date | null): string {
		const end = resolvedAt ? new Date(resolvedAt) : new Date();
		const start = new Date(startedAt);
		const diffMs = end.getTime() - start.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffDays > 0) {
			return `${diffDays}d ${diffHours % 24}h`;
		}
		if (diffHours > 0) {
			return `${diffHours}h ${diffMins % 60}m`;
		}
		return `${diffMins}m`;
	}
</script>

<svelte:head>
	<title>Incidents - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Incidents</h1>
			<p class="text-muted-foreground">Track and manage service incidents</p>
		</div>
		<div class="flex items-center gap-2">
			{#if data.includeResolved}
				<Button variant="outline" href="/incidents">Hide Resolved</Button>
			{:else}
				<Button variant="outline" href="/incidents?resolved=true">Show Resolved</Button>
			{/if}
			<Button href="/incidents/new">
				<Plus class="mr-2 h-4 w-4" />
				Report Incident
			</Button>
		</div>
	</div>

	{#if data.incidents.length === 0}
		<EmptyState
			icon={TriangleAlert}
			title="No incidents"
			description={data.includeResolved
				? 'No incidents have been reported yet.'
				: 'All systems operational. No active incidents.'}
		/>
	{:else}
		<div class="space-y-4">
			{#each data.incidents as inc (inc.id)}
				{@const statusInfo = getStatusInfo(inc.status)}
				{@const impactInfo = getImpactInfo(inc.impact)}
				{@const StatusIcon = statusInfo.icon}
				<Card.Root>
					<Card.Content class="p-6">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<h3 class="font-semibold">{inc.title}</h3>
									<Badge variant={statusInfo.variant}>
										<StatusIcon class="mr-1 h-3 w-3" />
										{statusInfo.label}
									</Badge>
									<Badge variant={impactInfo.variant}>{impactInfo.label} impact</Badge>
									{#if inc.isAutoCreated}
										<Badge variant="outline">Auto-created</Badge>
									{/if}
								</div>
								<div class="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
									<span>Started: {formatIncidentDate(inc.startedAt)}</span>
									{#if inc.resolvedAt}
										<span>Resolved: {formatIncidentDate(inc.resolvedAt)}</span>
									{/if}
									<span>Duration: {getDuration(inc.startedAt, inc.resolvedAt)}</span>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<Button variant="outline" size="sm" href="/incidents/{inc.id}">View Details</Button>
								<Button variant="ghost" size="icon" onclick={() => (deleteIncidentId = inc.id)}>
									<Trash2 class="h-4 w-4" />
								</Button>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<DeleteDialog
	itemId={deleteIncidentId}
	onOpenChange={() => (deleteIncidentId = null)}
	title="Delete incident?"
	description="This will permanently delete this incident and all its updates. This action cannot be undone."
	inputName="incidentId"
/>
