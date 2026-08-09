<script lang="ts">
	import { resolve } from "$app/paths";
	import { formatDuration } from "$lib/format";
	import { getStatusInfo, getImpactInfo, formatIncidentDateTime } from "$lib/incidents";
	import { m } from "$lib/paraglide/messages.js";
	import { ArrowLeft, Clock, Server, FileText } from "@lucide/svelte";

	let { data } = $props();

	const { page, incident, affectedMonitors } = $derived(data);
	const statusInfo = $derived(getStatusInfo(incident.status));
	const impactInfo = $derived(getImpactInfo(incident.impact));

	// Separate postmortem from timeline updates
	const postmortemUpdate = $derived(incident.updates.find((u) => u.status === "postmortem"));
	const timelineUpdates = $derived(incident.updates.filter((u) => u.status !== "postmortem"));
</script>

<svelte:head>
	<title>{m.public_incident_page_title({ title: incident.title, name: page.name })}</title>
	{#if page.faviconUrl}
		<link rel="icon" href={page.faviconUrl} />
	{/if}
</svelte:head>

<div class="bg-background min-h-screen">
	<!-- Header -->
	<header class="bg-card border-b">
		<div class="mx-auto max-w-4xl px-4 py-6">
			<div class="flex items-center gap-4">
				{#if page.logoUrl}
					<img src={page.logoUrl} alt={page.name} class="h-10 w-auto" />
				{/if}
				<div>
					<h1 class="text-foreground text-2xl font-bold">{page.name}</h1>
					{#if page.description}
						<p class="text-muted-foreground text-sm">{page.description}</p>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-4 py-8">
		<!-- Back link -->
		<a
			href={resolve(`/status/${page.slug}`)}
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
						>{m.public_status_started({ date: formatIncidentDateTime(incident.startedAt) })}</span
					>
				</div>
				{#if incident.resolvedAt}
					<div class="flex items-center gap-2">
						<Clock class="text-muted-foreground h-4 w-4" />
						<span class="font-mono"
							>{m.public_incident_resolved({
								date: formatIncidentDateTime(incident.resolvedAt),
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
						date: formatIncidentDateTime(postmortemUpdate.createdAt),
					})}
				</p>
			</div>
		{/if}

		<!-- Timeline -->
		<div class="bg-card rounded-lg border p-6">
			<h3 class="text-foreground mb-6 text-lg font-semibold">{m.public_incident_timeline()}</h3>

			{#if timelineUpdates.length > 0}
				<div class="relative space-y-6">
					{#each timelineUpdates as update, i (update.id)}
						{@const updateStatusInfo = getStatusInfo(update.status)}
						{@const UpdateIcon = updateStatusInfo.icon}
						<div class="relative flex gap-4">
							<!-- Connector line -->
							{#if i < timelineUpdates.length - 1}
								<div class="bg-border absolute top-10 left-4 h-full w-0.5"></div>
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
									<span class="text-muted-foreground font-mono text-sm">
										{formatIncidentDateTime(update.createdAt)}
									</span>
								</div>
								<p class="text-foreground mt-2">{update.message}</p>
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
	<footer class="bg-card border-t py-6">
		<div class="text-muted-foreground mx-auto max-w-4xl px-4 text-center text-sm">
			{m.public_status_footer()}
		</div>
	</footer>
</div>
