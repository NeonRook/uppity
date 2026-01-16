<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Plus, AlertTriangle, CheckCircle2, Search, Eye, Clock, Trash2 } from '@lucide/svelte';
	import type { Incident } from '$lib/server/db/schema';

	interface Props {
		data: {
			incidents: Incident[];
			includeResolved: boolean;
		};
	}

	let { data }: Props = $props();

	let deleteIncidentId = $state<string | null>(null);
	let deleting = $state(false);

	function getStatusInfo(status: string) {
		switch (status) {
			case 'investigating':
				return { label: 'Investigating', variant: 'destructive' as const, icon: Search };
			case 'identified':
				return { label: 'Identified', variant: 'destructive' as const, icon: Eye };
			case 'monitoring':
				return { label: 'Monitoring', variant: 'secondary' as const, icon: Clock };
			case 'resolved':
				return { label: 'Resolved', variant: 'outline' as const, icon: CheckCircle2 };
			default:
				return { label: status, variant: 'secondary' as const, icon: AlertTriangle };
		}
	}

	function getImpactInfo(impact: string) {
		switch (impact) {
			case 'none':
				return { label: 'None', variant: 'outline' as const };
			case 'minor':
				return { label: 'Minor', variant: 'secondary' as const };
			case 'major':
				return { label: 'Major', variant: 'destructive' as const };
			case 'critical':
				return { label: 'Critical', variant: 'destructive' as const };
			default:
				return { label: impact, variant: 'secondary' as const };
		}
	}

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

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
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<AlertTriangle class="h-12 w-12 text-muted-foreground/50" />
					<h3 class="mt-4 text-lg font-semibold">No incidents</h3>
					<p class="mt-2 mb-4 text-sm text-muted-foreground">
						{data.includeResolved
							? 'No incidents have been reported yet.'
							: 'All systems operational. No active incidents.'}
					</p>
				</div>
			</Card.Content>
		</Card.Root>
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
									<span>Started: {formatDate(inc.startedAt)}</span>
									{#if inc.resolvedAt}
										<span>Resolved: {formatDate(inc.resolvedAt)}</span>
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

<AlertDialog.Root
	open={deleteIncidentId !== null}
	onOpenChange={(open) => !open && (deleteIncidentId = null)}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete incident?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete this incident and all its updates. This action cannot be
				undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (deleteIncidentId = null)}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
						deleteIncidentId = null;
					};
				}}
			>
				<input type="hidden" name="incidentId" value={deleteIncidentId} />
				<Button type="submit" variant="destructive" disabled={deleting}>
					{deleting ? 'Deleting...' : 'Delete'}
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
