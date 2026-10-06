<script lang="ts">
	import { resolve } from "$app/paths";
	import { ArrowLeft, Clock, Server, FileText } from "@lucide/svelte";

	import IncidentTimeline from "#lib/components/incident-timeline.svelte";
	import StatusPageShell from "#lib/components/status-page-shell.svelte";
	import { formatDateTimeMonthDay, formatDuration } from "#lib/format.js";
	import { getStatusInfo, getImpactInfo } from "#lib/incidents.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const { page, incident, affectedMonitors } = $derived(data);
	const statusInfo = $derived(getStatusInfo(incident.status));
	const impactInfo = $derived(getImpactInfo(incident.impact));

	// Separate postmortem from timeline updates
	const postmortemUpdate = $derived(incident.updates.find((u) => u.status === "postmortem"));
	const timelineUpdates = $derived(incident.updates.filter((u) => u.status !== "postmortem"));
</script>

<StatusPageShell
	{page}
	title={m.public_incident_page_title({ title: incident.title, name: page.name })}
>
	<!-- Back link -->
	<a
		href={resolve(`status/${page.slug}`)}
		class="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
	>
		<ArrowLeft class="h-4 w-4" />
		{m.public_incident_back()}
	</a>

	<!-- Incident Header -->
	<div class="bg-card mb-8 rounded-lg border p-6">
		<div class="mb-4">
			<h2 class="text-foreground text-2xl font-bold">{incident.title}</h2>
			<div class="mt-3 flex flex-wrap items-center gap-3">
				<span
					class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium {statusInfo.bg} {statusInfo.color}"
				>
					<statusInfo.icon class="h-4 w-4" />
					{statusInfo.label}
				</span>
				<span
					class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium {impactInfo.bg} {impactInfo.color}"
				>
					{m.incidents_impact({ impact: impactInfo.label })}
				</span>
			</div>
		</div>

		<!-- Duration Info -->
		<div class="border-border text-muted-foreground flex flex-wrap gap-6 border-t pt-4 text-sm">
			<div class="flex items-center gap-2">
				<Clock class="text-muted-foreground h-4 w-4" />
				<span class="font-mono"
					>{m.public_status_started({ date: formatDateTimeMonthDay(incident.startedAt) })}</span
				>
			</div>
			{#if incident.resolvedAt}
				<div class="flex items-center gap-2">
					<Clock class="text-muted-foreground h-4 w-4" />
					<span class="font-mono"
						>{m.public_incident_resolved({
							date: formatDateTimeMonthDay(incident.resolvedAt),
						})}</span
					>
				</div>
			{/if}
			<div class="flex items-center gap-2">
				<span class="font-mono"
					>{m.public_status_duration({
						duration: formatDuration(incident.startedAt, incident.resolvedAt),
					})}</span
				>
				{#if !incident.resolvedAt}
					<span class="text-muted-foreground">{m.public_incident_ongoing()}</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- Affected Monitors -->
	{#if affectedMonitors.length > 0}
		<div class="bg-card mb-8 rounded-lg border p-6">
			<h3 class="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
				<Server class="text-muted-foreground h-5 w-5" />
				{m.public_incident_affected_services()}
			</h3>
			<div class="flex flex-wrap gap-2">
				{#each affectedMonitors as monitor (monitor.id)}
					<span class="bg-secondary text-foreground rounded-full px-3 py-1 text-sm">
						{monitor.name}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Postmortem -->
	{#if postmortemUpdate}
		<div
			class="border-status-maintenance/30 bg-status-maintenance-surface mb-8 rounded-lg border p-6"
		>
			<h3 class="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
				<FileText class="text-status-maintenance-ink h-5 w-5" />
				{m.incident_status_postmortem()}
			</h3>
			<div class="prose prose-sm text-foreground max-w-none">
				<p class="whitespace-pre-wrap">{postmortemUpdate.message}</p>
			</div>
			<p class="text-muted-foreground mt-4 text-xs">
				{m.incident_postmortem_published({
					date: formatDateTimeMonthDay(postmortemUpdate.createdAt),
				})}
			</p>
		</div>
	{/if}

	<!-- Timeline -->
	<div class="bg-card rounded-lg border p-6">
		<h3 class="text-foreground mb-6 text-lg font-semibold">{m.public_incident_timeline()}</h3>

		{#if timelineUpdates.length > 0}
			<IncidentTimeline updates={timelineUpdates} />
		{:else}
			<p class="text-muted-foreground">{m.public_incident_no_updates()}</p>
		{/if}
	</div>
</StatusPageShell>
