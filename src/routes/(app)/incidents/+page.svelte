<script lang="ts">
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { formatIncidentDate, getImpactInfo, getStatusInfo } from '$lib/incidents';
	import { m } from '$lib/paraglide/messages.js';
	import { deleteIncident, getIncidents } from '$lib/remote/incidents.remote';
	import { Plus, Trash2, TriangleAlert } from '@lucide/svelte';

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

	async function handleDelete(incidentId: string) {
		await deleteIncident({ incidentId }).updates(
			getIncidents({ includeResolved: data.includeResolved }).withOverride((incidents) =>
				incidents.filter((inc) => inc.id !== incidentId)
			)
		);
	}
</script>

<svelte:head>
	<title>{m.incidents_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.incidents_title()}</h1>
			<p class="text-muted-foreground">{m.incidents_subtitle()}</p>
		</div>
		<div class="flex items-center gap-2">
			{#if data.includeResolved}
				<Button variant="outline" href="/incidents">{m.incidents_hide_resolved()}</Button>
			{:else}
				<Button variant="outline" href="/incidents?resolved=true"
					>{m.incidents_show_resolved()}</Button
				>
			{/if}
			<Button href="/incidents/new">
				<Plus class="mr-2 h-4 w-4" />
				{m.incidents_report()}
			</Button>
		</div>
	</div>

	{#if data.incidents.length === 0}
		<EmptyState
			icon={TriangleAlert}
			title={m.incidents_empty_title()}
			description={data.includeResolved
				? m.incidents_empty_no_reports()
				: m.incidents_empty_all_operational()}
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
										<Badge variant="outline">{m.incidents_auto_created()}</Badge>
									{/if}
								</div>
								<div class="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
									<span>{m.incidents_started({ date: formatIncidentDate(inc.startedAt) })}</span>
									{#if inc.resolvedAt}
										<span>{m.incidents_resolved({ date: formatIncidentDate(inc.resolvedAt) })}</span
										>
									{/if}
									<span
										>{m.incidents_duration({
											duration: getDuration(inc.startedAt, inc.resolvedAt)
										})}</span
									>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<Button variant="outline" size="sm" href="/incidents/{inc.id}"
									>{m.incidents_view_details()}</Button
								>
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
	onDelete={handleDelete}
	title={m.incidents_delete_title()}
	description={m.incidents_delete_desc()}
/>
