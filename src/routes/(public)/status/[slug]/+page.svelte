<script lang="ts">
	import { CircleCheckBig, TriangleAlert, CircleX, CircleMinus } from '@lucide/svelte';
	import {
		getStatusInfo,
		getImpactInfo,
		formatIncidentDateTime
	} from '$lib/incidents';

	let { data } = $props();

	const { page, groups, ungroupedMonitors, overallStatus, activeIncidents } = $derived(
		data.statusData
	);

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
						<div class="rounded-lg border bg-white p-5 shadow-sm">
							<!-- Incident Header -->
							<div class="mb-4 flex items-start justify-between">
								<div>
									<h3 class="text-lg font-semibold text-gray-900">{incident.title}</h3>
									<div class="mt-1 flex flex-wrap items-center gap-2">
										<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium {incidentStatusInfo.bg} {incidentStatusInfo.color}">
											<incidentStatusInfo.icon class="h-3 w-3" />
											{incidentStatusInfo.label}
										</span>
										<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {impactInfo.bg} {impactInfo.color}">
											{impactInfo.label} Impact
										</span>
										<span class="text-xs text-gray-500">
											Started {formatIncidentDateTime(incident.createdAt)}
										</span>
									</div>
								</div>
							</div>

							<!-- Timeline -->
							{#if incident.updates.length > 0}
								<div class="relative mt-4 space-y-4 border-t border-gray-100 pt-4">
									{#each incident.updates.slice(0, 5) as update, i (update.id)}
										{@const updateStatusInfo = getStatusInfo(update.status)}
										{@const UpdateIcon = updateStatusInfo.icon}
										<div class="relative flex gap-4">
											<!-- Connector line -->
											{#if i < Math.min(incident.updates.length, 5) - 1}
												<div class="absolute left-[15px] top-8 h-full w-0.5 bg-gray-200"></div>
											{/if}
											<!-- Icon -->
											<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {updateStatusInfo.bg}">
												<UpdateIcon class="h-4 w-4 {updateStatusInfo.color}" />
											</div>
											<!-- Content -->
											<div class="flex-1 pb-2">
												<div class="flex flex-wrap items-center gap-2">
													<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {updateStatusInfo.bg} {updateStatusInfo.color}">
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
									{#if incident.updates.length > 5}
										<p class="pl-12 text-xs text-gray-500">
											+ {incident.updates.length - 5} more updates
										</p>
									{/if}
								</div>
							{/if}
						</div>
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
