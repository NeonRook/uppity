<script lang="ts">
	import { ArrowLeft, Clock, Server, FileText } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { getStatusInfo, getImpactInfo, formatIncidentDateTime } from '$lib/incidents';
	import { formatDuration } from '$lib/format';

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

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="border-b bg-white">
		<div class="mx-auto max-w-4xl px-4 py-6">
			<div class="flex items-center gap-4">
				{#if page.logoUrl}
					<img src={page.logoUrl} alt={page.name} class="h-10 w-auto" />
				{/if}
				<div>
					<h1 class="text-2xl font-bold text-gray-900">{page.name}</h1>
					{#if page.description}
						<p class="text-sm text-gray-600">{page.description}</p>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-4 py-8">
		<!-- Back link -->
		<a
			href={resolve(`/status/${page.slug}`)}
			class="mb-6 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
		>
			<ArrowLeft class="h-4 w-4" />
			Back to Status
		</a>

		<!-- Incident Header -->
		<div class="mb-8 rounded-lg border bg-white p-6 shadow-sm">
			<div class="mb-4">
				<h2 class="text-2xl font-bold text-gray-900">{incident.title}</h2>
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
						{impactInfo.label} Impact
					</span>
				</div>
			</div>

			<!-- Duration Info -->
			<div class="flex flex-wrap gap-6 border-t border-gray-100 pt-4 text-sm text-gray-600">
				<div class="flex items-center gap-2">
					<Clock class="h-4 w-4 text-gray-400" />
					<span>Started {formatIncidentDateTime(incident.startedAt)}</span>
				</div>
				{#if incident.resolvedAt}
					<div class="flex items-center gap-2">
						<Clock class="h-4 w-4 text-gray-400" />
						<span>Resolved {formatIncidentDateTime(incident.resolvedAt)}</span>
					</div>
				{/if}
				<div class="flex items-center gap-2">
					<span class="font-medium text-gray-700">Duration:</span>
					<span>{formatDuration(incident.startedAt, incident.resolvedAt)}</span>
					{#if !incident.resolvedAt}
						<span class="text-gray-400">(ongoing)</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Affected Monitors -->
		{#if affectedMonitors.length > 0}
			<div class="mb-8 rounded-lg border bg-white p-6 shadow-sm">
				<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
					<Server class="h-5 w-5 text-gray-500" />
					Affected Services
				</h3>
				<div class="flex flex-wrap gap-2">
					{#each affectedMonitors as monitor (monitor.id)}
						<span class="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
							{monitor.name}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Postmortem -->
		{#if postmortemUpdate}
			<div class="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-6 shadow-sm">
				<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
					<FileText class="h-5 w-5 text-blue-600" />
					Postmortem
				</h3>
				<div class="prose prose-sm max-w-none text-gray-700">
					<p class="whitespace-pre-wrap">{postmortemUpdate.message}</p>
				</div>
				<p class="mt-4 text-xs text-gray-500">
					Published {formatIncidentDateTime(postmortemUpdate.createdAt)}
				</p>
			</div>
		{/if}

		<!-- Timeline -->
		<div class="rounded-lg border bg-white p-6 shadow-sm">
			<h3 class="mb-6 text-lg font-semibold text-gray-900">Incident Timeline</h3>

			{#if timelineUpdates.length > 0}
				<div class="relative space-y-6">
					{#each timelineUpdates as update, i (update.id)}
						{@const updateStatusInfo = getStatusInfo(update.status)}
						{@const UpdateIcon = updateStatusInfo.icon}
						<div class="relative flex gap-4">
							<!-- Connector line -->
							{#if i < timelineUpdates.length - 1}
								<div class="absolute top-10 left-4 h-full w-0.5 bg-gray-200"></div>
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
									<span class="text-sm text-gray-500">
										{formatIncidentDateTime(update.createdAt)}
									</span>
								</div>
								<p class="mt-2 text-gray-700">{update.message}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-gray-500">No updates available.</p>
			{/if}
		</div>
	</main>

	<!-- Footer -->
	<footer class="border-t bg-white py-6">
		<div class="mx-auto max-w-4xl px-4 text-center text-sm text-gray-500">Powered by Uppity</div>
	</footer>
</div>
