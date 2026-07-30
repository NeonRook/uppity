<script lang="ts">
	import { ArrowLeft, Clock, Server, FileText } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { getStatusInfo, getImpactInfo, formatIncidentDateTime } from '$lib/incidents';
	import { formatDuration } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const { page, incident, affectedMonitors } = $derived(data);
	const statusInfo = $derived(getStatusInfo(incident.status));
	const impactInfo = $derived(getImpactInfo(incident.impact));

	// Separate postmortem from timeline updates
	const postmortemUpdate = $derived(incident.updates.find((u) => u.status === 'postmortem'));
	const timelineUpdates = $derived(incident.updates.filter((u) => u.status !== 'postmortem'));
</script>

<svelte:head>
	<title>{incident.title} - {page.name} Status</title>
	{#if page.faviconUrl}
		<link rel="icon" href={page.faviconUrl} />
	{/if}
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<header class="border-b bg-card">
		<div class="mx-auto max-w-4xl px-4 py-6">
			<div class="flex items-center gap-4">
				{#if page.logoUrl}
					<img src={page.logoUrl} alt={page.name} class="h-10 w-auto" />
				{/if}
				<div>
					<h1 class="text-2xl font-bold text-foreground">{page.name}</h1>
					{#if page.description}
						<p class="text-sm text-muted-foreground">{page.description}</p>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-4 py-8">
		<!-- Back link -->
		<a
			href={resolve(`/status/${page.slug}`)}
			class="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
		>
			<ArrowLeft class="h-4 w-4" />
			{m.public_incident_back()}
		</a>

		<!-- Incident Header -->
		<div class="mb-8 rounded-lg border bg-card p-6">
			<div class="mb-4">
				<h2 class="text-2xl font-bold text-foreground">{incident.title}</h2>
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
			<div class="flex flex-wrap gap-6 border-t border-border pt-4 text-sm text-muted-foreground">
				<div class="flex items-center gap-2">
					<Clock class="h-4 w-4 text-muted-foreground" />
					<span
						>{m.public_status_started({ date: formatIncidentDateTime(incident.startedAt) })}</span
					>
				</div>
				{#if incident.resolvedAt}
					<div class="flex items-center gap-2">
						<Clock class="h-4 w-4 text-muted-foreground" />
						<span
							>{m.public_incident_resolved({
								date: formatIncidentDateTime(incident.resolvedAt)
							})}</span
						>
					</div>
				{/if}
				<div class="flex items-center gap-2">
					<span
						>{m.public_status_duration({
							duration: formatDuration(incident.startedAt, incident.resolvedAt)
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
			<div class="mb-8 rounded-lg border bg-card p-6">
				<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
					<Server class="h-5 w-5 text-muted-foreground" />
					{m.public_incident_affected_services()}
				</h3>
				<div class="flex flex-wrap gap-2">
					{#each affectedMonitors as monitor (monitor.id)}
						<span class="rounded-full bg-secondary px-3 py-1 text-sm text-foreground">
							{monitor.name}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Postmortem -->
		{#if postmortemUpdate}
			<div
				class="mb-8 rounded-lg border border-status-maintenance/30 bg-status-maintenance-surface p-6"
			>
				<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
					<FileText class="h-5 w-5 text-status-maintenance-ink" />
					{m.incident_status_postmortem()}
				</h3>
				<div class="prose prose-sm max-w-none text-foreground">
					<p class="whitespace-pre-wrap">{postmortemUpdate.message}</p>
				</div>
				<p class="mt-4 text-xs text-muted-foreground">
					{m.incident_postmortem_published({
						date: formatIncidentDateTime(postmortemUpdate.createdAt)
					})}
				</p>
			</div>
		{/if}

		<!-- Timeline -->
		<div class="rounded-lg border bg-card p-6">
			<h3 class="mb-6 text-lg font-semibold text-foreground">{m.public_incident_timeline()}</h3>

			{#if timelineUpdates.length > 0}
				<div class="relative space-y-6">
					{#each timelineUpdates as update, i (update.id)}
						{@const updateStatusInfo = getStatusInfo(update.status)}
						{@const UpdateIcon = updateStatusInfo.icon}
						<div class="relative flex gap-4">
							<!-- Connector line -->
							{#if i < timelineUpdates.length - 1}
								<div class="absolute top-10 left-4 h-full w-0.5 bg-border"></div>
							{/if}
							<!-- Icon -->
							<div
								class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full {updateStatusInfo.bg}"
							>
								<UpdateIcon class="h-4 w-4 {updateStatusInfo.color}" />
							</div>
							<!-- Content -->
							<div class="flex-1 pb-2">
								<div class="flex flex-wrap items-center gap-2">
									<span
										class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {updateStatusInfo.bg} {updateStatusInfo.color}"
									>
										{updateStatusInfo.label}
									</span>
									<span class="text-sm text-muted-foreground">
										{formatIncidentDateTime(update.createdAt)}
									</span>
								</div>
								<p class="mt-2 text-foreground">{update.message}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground">{m.public_incident_no_updates()}</p>
			{/if}
		</div>
	</main>

	<!-- Footer -->
	<footer class="border-t bg-card py-6">
		<div class="mx-auto max-w-4xl px-4 text-center text-sm text-muted-foreground">
			{m.public_status_footer()}
		</div>
	</footer>
</div>
