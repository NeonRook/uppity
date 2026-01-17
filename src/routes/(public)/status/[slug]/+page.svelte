<script lang="ts">
	import {
		CircleCheckBig,
		TriangleAlert,
		CircleX,
		CircleMinus,
		ChevronRight,
		History
	} from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { getStatusInfo, getImpactInfo, formatIncidentDateTime } from '$lib/incidents';

	let { data } = $props();

	const { page, groups, ungroupedMonitors, overallStatus, activeIncidents, resolvedIncidents } =
		$derived(data.statusData);

	function formatDuration(startedAt: Date, resolvedAt: Date | null): string {
		const start = new Date(startedAt);
		const end = resolvedAt ? new Date(resolvedAt) : new Date();
		const diffMs = end.getTime() - start.getTime();

		const minutes = Math.floor(diffMs / 60000);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return `${days}d ${hours % 24}h`;
		}
		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		}
		return `${minutes}m`;
	}

	function getOverallStatusInfo() {
		switch (overallStatus) {
			case 'operational':
				return {
					label: 'All Systems Operational',
					icon: CircleCheckBig,
					bgColor: 'bg-green-500',
					textColor: 'text-green-500'
				};
			case 'degraded':
				return {
					label: 'Degraded Performance',
					icon: TriangleAlert,
					bgColor: 'bg-yellow-500',
					textColor: 'text-yellow-500'
				};
			case 'partial_outage':
				return {
					label: 'Partial Outage',
					icon: CircleMinus,
					bgColor: 'bg-orange-500',
					textColor: 'text-orange-500'
				};
			case 'major_outage':
				return {
					label: 'Major Outage',
					icon: CircleX,
					bgColor: 'bg-red-500',
					textColor: 'text-red-500'
				};
			default:
				return {
					label: 'Unknown',
					icon: CircleMinus,
					bgColor: 'bg-gray-500',
					textColor: 'text-gray-500'
				};
		}
	}

	function getMonitorStatusColor(status: string): string {
		switch (status) {
			case 'up':
				return 'bg-green-500';
			case 'down':
				return 'bg-red-500';
			case 'degraded':
				return 'bg-yellow-500';
			default:
				return 'bg-gray-400';
		}
	}

	function getDayStatusColor(status: string): string {
		switch (status) {
			case 'up':
				return 'bg-green-500 hover:bg-green-400';
			case 'down':
				return 'bg-red-500 hover:bg-red-400';
			case 'degraded':
				return 'bg-yellow-500 hover:bg-yellow-400';
			case 'partial':
				return 'bg-orange-500 hover:bg-orange-400';
			default:
				return 'bg-gray-300 hover:bg-gray-200';
		}
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	const statusInfo = $derived(getOverallStatusInfo());
</script>

<svelte:head>
	<title>{page.name} - Status</title>
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
		<!-- Overall Status Banner -->
		<div class="mb-8 rounded-lg {statusInfo.bgColor} p-6 text-white">
			<div class="flex items-center gap-3">
				<statusInfo.icon class="h-8 w-8" />
				<span class="text-2xl font-semibold">{statusInfo.label}</span>
			</div>
		</div>

		<!-- Active Incidents -->
		{#if activeIncidents.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-lg font-semibold text-gray-900">Active Incidents</h2>
				<div class="space-y-4">
					{#each activeIncidents as incident (incident.id)}
						{@const incidentStatusInfo = getStatusInfo(incident.status)}
						{@const impactInfo = getImpactInfo(incident.impact)}
						{@const timelineUpdates = incident.updates.filter((u) => u.status !== 'postmortem')}
						<a
							href={resolve(`/status/${page.slug}/incidents/${incident.id}`)}
							class="block rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
						>
							<!-- Incident Header -->
							<div class="mb-4 flex items-start justify-between">
								<div class="flex-1">
									<h3 class="text-lg font-semibold text-gray-900">{incident.title}</h3>
									<div class="mt-1 flex flex-wrap items-center gap-2">
										<span
											class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium {incidentStatusInfo.bg} {incidentStatusInfo.color}"
										>
											<incidentStatusInfo.icon class="h-3 w-3" />
											{incidentStatusInfo.label}
										</span>
										<span
											class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {impactInfo.bg} {impactInfo.color}"
										>
											{impactInfo.label} Impact
										</span>
										<span class="text-xs text-gray-500">
											Started {formatIncidentDateTime(incident.startedAt)}
										</span>
									</div>
								</div>
								<ChevronRight class="h-5 w-5 shrink-0 text-gray-400" />
							</div>

							<!-- Timeline (excluding postmortem) -->
							{#if timelineUpdates.length > 0}
								<div class="relative mt-4 space-y-4 border-t border-gray-100 pt-4">
									{#each timelineUpdates.slice(0, 3) as update, i (update.id)}
										{@const updateStatusInfo = getStatusInfo(update.status)}
										{@const UpdateIcon = updateStatusInfo.icon}
										<div class="relative flex gap-4">
											<!-- Connector line -->
											{#if i < Math.min(timelineUpdates.length, 3) - 1}
												<div class="absolute top-8 left-3.75 h-full w-0.5 bg-gray-200"></div>
											{/if}
											<!-- Icon -->
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {updateStatusInfo.bg}"
											>
												<UpdateIcon class="h-4 w-4 {updateStatusInfo.color}" />
											</div>
											<!-- Content -->
											<div class="flex-1 pb-2">
												<div class="flex flex-wrap items-center gap-2">
													<span
														class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {updateStatusInfo.bg} {updateStatusInfo.color}"
													>
														{updateStatusInfo.label}
													</span>
													<span class="text-xs text-gray-500">
														{formatIncidentDateTime(update.createdAt)}
													</span>
												</div>
												<p class="mt-1 text-sm text-gray-700">{update.message}</p>
											</div>
										</div>
									{/each}
									{#if timelineUpdates.length > 3}
										<p class="pl-12 text-xs text-gray-500">
											+ {timelineUpdates.length - 3} more updates - click to view all
										</p>
									{/if}
								</div>
							{/if}
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Ungrouped Monitors -->
		{#if ungroupedMonitors.length > 0}
			<section class="mb-8">
				<div class="space-y-4">
					{#each ungroupedMonitors as monitor (monitor.id)}
						<div class="rounded-lg border bg-white p-4">
							<div class="mb-3 flex items-center justify-between">
								<div class="flex items-center gap-2">
									<div class="h-3 w-3 rounded-full {getMonitorStatusColor(monitor.status)}"></div>
									<span class="font-medium text-gray-900">{monitor.name}</span>
								</div>
								<span class="text-sm text-gray-500">
									{monitor.uptimePercent90d.toFixed(2)}% uptime
								</span>
							</div>
							<!-- 90-day uptime bar -->
							<div class="flex gap-0.5">
								{#each monitor.dailyHistory as day (day.date)}
									<div
										class="h-8 flex-1 rounded-sm transition-colors {getDayStatusColor(day.status)}"
										title="{formatDate(day.date)}: {day.uptimePercent.toFixed(1)}% uptime"
									></div>
								{/each}
							</div>
							<div class="mt-1 flex justify-between text-xs text-gray-400">
								<span>90 days ago</span>
								<span>Today</span>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Grouped Monitors -->
		{#each groups as group (group.id)}
			{#if group.monitors.length > 0}
				<section class="mb-8">
					<h2 class="mb-4 text-lg font-semibold text-gray-900">{group.name}</h2>
					{#if group.description}
						<p class="mb-4 text-sm text-gray-600">{group.description}</p>
					{/if}
					<div class="space-y-4">
						{#each group.monitors as monitor (monitor.id)}
							<div class="rounded-lg border bg-white p-4">
								<div class="mb-3 flex items-center justify-between">
									<div class="flex items-center gap-2">
										<div class="h-3 w-3 rounded-full {getMonitorStatusColor(monitor.status)}"></div>
										<span class="font-medium text-gray-900">{monitor.name}</span>
									</div>
									<span class="text-sm text-gray-500">
										{monitor.uptimePercent90d.toFixed(2)}% uptime
									</span>
								</div>
								<!-- 90-day uptime bar -->
								<div class="flex gap-0.5">
									{#each monitor.dailyHistory as day (day.date)}
										<div
											class="h-8 flex-1 rounded-sm transition-colors {getDayStatusColor(
												day.status
											)}"
											title="{formatDate(day.date)}: {day.uptimePercent.toFixed(1)}% uptime"
										></div>
									{/each}
								</div>
								<div class="mt-1 flex justify-between text-xs text-gray-400">
									<span>90 days ago</span>
									<span>Today</span>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/each}

		<!-- Incident History -->
		<section class="mb-8">
			<h2 class="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
				<History class="h-5 w-5 text-gray-500" />
				Incident History
			</h2>
			{#if resolvedIncidents.length > 0}
				<div class="space-y-3">
					{#each resolvedIncidents as incident (incident.id)}
						{@const impactInfo = getImpactInfo(incident.impact)}
						<a
							href={resolve(`/status/${page.slug}/incidents/${incident.id}`)}
							class="flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
						>
							<div class="flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<h3 class="font-medium text-gray-900">{incident.title}</h3>
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {impactInfo.bg} {impactInfo.color}"
									>
										{impactInfo.label}
									</span>
								</div>
								<div class="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
									<span>{formatIncidentDateTime(incident.startedAt)}</span>
									{#if incident.resolvedAt}
										<span>Duration: {formatDuration(incident.startedAt, incident.resolvedAt)}</span>
									{/if}
								</div>
							</div>
							<ChevronRight class="h-5 w-5 shrink-0 text-gray-400" />
						</a>
					{/each}
				</div>
			{:else}
				<div class="rounded-lg border bg-white p-6 text-center text-gray-500">
					No incidents in the past 90 days.
				</div>
			{/if}
		</section>

		<!-- Legend -->
		<section class="mt-12 border-t pt-6">
			<h3 class="mb-3 text-sm font-medium text-gray-700">Legend</h3>
			<div class="flex flex-wrap gap-4 text-sm">
				<div class="flex items-center gap-2">
					<div class="h-3 w-3 rounded-full bg-green-500"></div>
					<span class="text-gray-600">Operational</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="h-3 w-3 rounded-full bg-yellow-500"></div>
					<span class="text-gray-600">Degraded</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="h-3 w-3 rounded-full bg-orange-500"></div>
					<span class="text-gray-600">Partial Outage</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="h-3 w-3 rounded-full bg-red-500"></div>
					<span class="text-gray-600">Down</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="h-3 w-3 rounded-full bg-gray-400"></div>
					<span class="text-gray-600">No Data</span>
				</div>
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="border-t bg-white py-6">
		<div class="mx-auto max-w-4xl px-4 text-center text-sm text-gray-500">Powered by Uppity</div>
	</footer>
</div>
