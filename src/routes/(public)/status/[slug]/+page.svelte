<script lang="ts">
	import { CircleCheckBig, TriangleAlert, CircleX, CircleMinus } from '@lucide/svelte';
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

	function formatDateTime(date: Date): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
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
						<div class="rounded-lg border border-orange-200 bg-orange-50 p-4">
							<div class="flex items-start justify-between">
								<div>
									<h3 class="font-semibold text-orange-900">{incident.title}</h3>
									<p class="text-sm text-orange-700">
										Impact: {incident.impact} | Status: {incident.status}
									</p>
								</div>
								<span class="text-xs text-orange-600">
									{formatDateTime(incident.createdAt)}
								</span>
							</div>
							{#if incident.updates.length > 0}
								<div class="mt-3 border-t border-orange-200 pt-3">
									{#each incident.updates.slice(0, 3) as update (update.id)}
										<div class="mb-2 text-sm">
											<span class="font-medium text-orange-800">{update.status}:</span>
											<span class="text-orange-700">{update.message}</span>
											<span class="ml-2 text-xs text-orange-500">
												{formatDateTime(update.createdAt)}
											</span>
										</div>
									{/each}
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
