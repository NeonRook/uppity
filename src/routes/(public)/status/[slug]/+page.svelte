<script lang="ts">
	import { resolve } from "$app/paths";
	import { formatDuration, formatDateMonthDay } from "$lib/format";
	import { getStatusInfo, getImpactInfo, formatIncidentDateTime } from "$lib/incidents";
	import { m } from "$lib/paraglide/messages.js";
	import { getMonitorStatusColor, getDayStatusColor } from "$lib/utils/status";
	import {
		CircleCheckBig,
		TriangleAlert,
		CircleX,
		CircleMinus,
		ChevronRight,
		History,
		Wrench,
		Clock,
	} from "@lucide/svelte";

	let { data } = $props();

	const {
		page,
		groups,
		ungroupedMonitors,
		overallStatus,
		activeIncidents,
		resolvedIncidents,
		activeMaintenance,
		upcomingMaintenance,
	} = $derived(data.statusData);

	function getOverallStatusInfo() {
		switch (overallStatus) {
			case "operational":
				return {
					label: m.public_status_all_operational(),
					icon: CircleCheckBig,
					bgColor: "bg-status-up",
					textColor: "text-status-up-foreground",
				};
			case "degraded":
				return {
					label: m.public_status_degraded(),
					icon: TriangleAlert,
					bgColor: "bg-status-degraded",
					textColor: "text-status-degraded-foreground",
				};
			case "partial_outage":
				return {
					label: m.public_status_partial(),
					icon: CircleMinus,
					bgColor: "bg-status-partial",
					textColor: "text-status-partial-foreground",
				};
			case "major_outage":
				return {
					label: m.public_status_major(),
					icon: CircleX,
					bgColor: "bg-status-down",
					textColor: "text-status-down-foreground",
				};
			case "under_maintenance":
				return {
					label: m.public_status_under_maintenance(),
					icon: Wrench,
					bgColor: "bg-status-maintenance",
					textColor: "text-status-maintenance-foreground",
				};
			default:
				return {
					label: m.public_status_unknown(),
					icon: CircleMinus,
					bgColor: "bg-status-unknown",
					textColor: "text-status-unknown-foreground",
				};
		}
	}

	const statusInfo = $derived(getOverallStatusInfo());
	/**
	 * An unmeasured window has no uptime figure. Rendering 100% for a monitor
	 * that has never been checked states a fact the database cannot support.
	 */
	function uptimeLabel(percent: number | null): string {
		return percent === null
			? m.public_status_no_data()
			: m.public_status_uptime({ percent: percent.toFixed(2) });
	}

	function dayTitle(date: string, percent: number | null): string {
		return percent === null
			? `${formatDateMonthDay(date)}: ${m.public_status_no_data()}`
			: `${formatDateMonthDay(date)}: ${percent.toFixed(1)}% uptime`;
	}
</script>

<svelte:head>
	<title>{m.public_status_page_title({ name: page.name })}</title>
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
		<!-- Overall Status Banner -->
		<div class="mb-8 rounded-lg {statusInfo.bgColor} {statusInfo.textColor} p-6">
			<div class="flex items-center gap-3">
				<statusInfo.icon class="h-8 w-8" />
				<span class="text-2xl font-semibold">{statusInfo.label}</span>
			</div>
		</div>

		<!-- Active Maintenance -->
		{#if activeMaintenance.length > 0}
			<section class="mb-8">
				<h2 class="text-foreground mb-4 text-lg font-semibold">
					{m.public_status_active_maintenance()}
				</h2>
				<div class="space-y-3">
					{#each activeMaintenance as w (w.id)}
						<div
							class="border-status-maintenance/40 bg-status-maintenance-surface flex items-start gap-3 rounded-lg border p-4"
						>
							<Wrench class="text-status-maintenance mt-0.5 h-5 w-5" />
							<div class="flex-1">
								<div class="text-foreground font-medium">
									{m.public_status_maintenance_active({ name: w.name })}
								</div>
								{#if w.description}
									<p class="text-muted-foreground mt-1 text-sm">{w.description}</p>
								{/if}
								<p class="text-muted-foreground mt-1 text-xs">
									{m.public_status_maintenance_ends({
										time: new Date(w.endsAt).toLocaleString(),
									})}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Upcoming Maintenance -->
		{#if upcomingMaintenance.length > 0}
			<section class="mb-8">
				<h2 class="text-foreground mb-4 text-lg font-semibold">
					{m.public_status_upcoming_maintenance()}
				</h2>
				<div class="space-y-3">
					{#each upcomingMaintenance as w (w.id)}
						<div
							class="border-status-maintenance/25 bg-status-maintenance-surface/60 flex items-start gap-3 rounded-lg border p-4"
						>
							<Clock class="text-status-maintenance/70 mt-0.5 h-5 w-5" />
							<div class="flex-1">
								<div class="text-foreground font-medium">
									{m.public_status_maintenance_scheduled({ name: w.name })}
								</div>
								{#if w.description}
									<p class="text-muted-foreground mt-1 text-sm">{w.description}</p>
								{/if}
								<p class="text-muted-foreground mt-1 text-xs">
									{m.public_status_maintenance_window({
										startTime: new Date(w.startsAt).toLocaleString(),
										endTime: new Date(w.endsAt).toLocaleString(),
									})}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Active Incidents -->
		{#if activeIncidents.length > 0}
			<section class="mb-8">
				<h2 class="text-foreground mb-4 text-lg font-semibold">
					{m.public_status_active_incidents()}
				</h2>
				<div class="space-y-4">
					{#each activeIncidents as incident (incident.id)}
						{@const incidentStatusInfo = getStatusInfo(incident.status)}
						{@const impactInfo = getImpactInfo(incident.impact)}
						{@const timelineUpdates = incident.updates.filter((u) => u.status !== "postmortem")}
						<a
							href={resolve(`/status/${page.slug}/incidents/${incident.id}`)}
							class="bg-card hover:bg-muted/50 block rounded-lg border p-5 transition-colors"
						>
							<!-- Incident Header -->
							<div class="mb-4 flex items-start justify-between">
								<div class="flex-1">
									<h3 class="text-foreground text-lg font-semibold">{incident.title}</h3>
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
											{m.incidents_impact({ impact: impactInfo.label })}
										</span>
										<span class="text-muted-foreground text-xs">
											{m.public_status_started({
												date: formatIncidentDateTime(incident.startedAt),
											})}
										</span>
									</div>
								</div>
								<ChevronRight class="text-muted-foreground h-5 w-5 shrink-0" />
							</div>

							<!-- Timeline (excluding postmortem) -->
							{#if timelineUpdates.length > 0}
								<div class="border-border relative mt-4 space-y-4 border-t pt-4">
									{#each timelineUpdates.slice(0, 3) as update, i (update.id)}
										{@const updateStatusInfo = getStatusInfo(update.status)}
										{@const UpdateIcon = updateStatusInfo.icon}
										<div class="relative flex gap-4">
											<!-- Connector line -->
											{#if i < Math.min(timelineUpdates.length, 3) - 1}
												<div class="bg-border absolute top-8 left-3.75 h-full w-0.5"></div>
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
													<span class="text-muted-foreground text-xs">
														{formatIncidentDateTime(update.createdAt)}
													</span>
												</div>
												<p class="text-foreground mt-1 text-sm">{update.message}</p>
											</div>
										</div>
									{/each}
									{#if timelineUpdates.length > 3}
										<p class="text-muted-foreground pl-12 text-xs">
											{m.public_status_more_updates({ count: timelineUpdates.length - 3 })}
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
						<div class="bg-card rounded-lg border p-4">
							<div class="mb-3 flex items-center justify-between">
								<div class="flex items-center gap-2">
									<div class="h-3 w-3 rounded-full {getMonitorStatusColor(monitor.status)}"></div>
									<span class="text-foreground font-medium">{monitor.name}</span>
								</div>
								<span class="text-muted-foreground font-mono text-sm">
									{uptimeLabel(monitor.uptimePercent90d)}
								</span>
							</div>
							<!-- 90-day uptime bar -->
							<div class="flex gap-0.5">
								{#each monitor.dailyHistory as day (day.date)}
									<div
										class="h-8 flex-1 rounded-sm transition-[filter] duration-200 hover:brightness-125 {getDayStatusColor(
											day.status,
										)}"
										title={dayTitle(day.date, day.uptimePercent)}
									></div>
								{/each}
							</div>
							<div class="text-muted-foreground mt-1 flex justify-between text-xs">
								<span>{m.public_status_days_ago()}</span>
								<span>{m.public_status_today()}</span>
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
					<h2 class="text-foreground mb-4 text-lg font-semibold">{group.name}</h2>
					{#if group.description}
						<p class="text-muted-foreground mb-4 text-sm">{group.description}</p>
					{/if}
					<div class="space-y-4">
						{#each group.monitors as monitor (monitor.id)}
							<div class="bg-card rounded-lg border p-4">
								<div class="mb-3 flex items-center justify-between">
									<div class="flex items-center gap-2">
										<div class="h-3 w-3 rounded-full {getMonitorStatusColor(monitor.status)}"></div>
										<span class="text-foreground font-medium">{monitor.name}</span>
									</div>
									<span class="text-muted-foreground font-mono text-sm">
										{uptimeLabel(monitor.uptimePercent90d)}
									</span>
								</div>
								<!-- 90-day uptime bar -->
								<div class="flex gap-0.5">
									{#each monitor.dailyHistory as day (day.date)}
										<div
											class="h-8 flex-1 rounded-sm transition-[filter] duration-200 hover:brightness-125 {getDayStatusColor(
												day.status,
											)}"
											title={dayTitle(day.date, day.uptimePercent)}
										></div>
									{/each}
								</div>
								<div class="text-muted-foreground mt-1 flex justify-between text-xs">
									<span>{m.public_status_days_ago()}</span>
									<span>{m.public_status_today()}</span>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/each}

		<!-- Incident History -->
		<section class="mb-8">
			<h2 class="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
				<History class="text-muted-foreground h-5 w-5" />
				{m.public_status_incident_history()}
			</h2>
			{#if resolvedIncidents.length > 0}
				<div class="space-y-3">
					{#each resolvedIncidents as incident (incident.id)}
						{@const impactInfo = getImpactInfo(incident.impact)}
						<a
							href={resolve(`/status/${page.slug}/incidents/${incident.id}`)}
							class="bg-card hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors"
						>
							<div class="flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<h3 class="text-foreground font-medium">{incident.title}</h3>
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {impactInfo.bg} {impactInfo.color}"
									>
										{impactInfo.label}
									</span>
								</div>
								<div class="text-muted-foreground mt-1 flex flex-wrap gap-3 text-xs">
									<span>{formatIncidentDateTime(incident.startedAt)}</span>
									{#if incident.resolvedAt}
										<span
											>{m.public_status_duration({
												duration: formatDuration(incident.startedAt, incident.resolvedAt),
											})}</span
										>
									{/if}
								</div>
							</div>
							<ChevronRight class="text-muted-foreground h-5 w-5 shrink-0" />
						</a>
					{/each}
				</div>
			{:else}
				<div class="bg-card text-muted-foreground rounded-lg border p-6 text-center">
					{m.public_status_no_incidents()}
				</div>
			{/if}
		</section>

		<!-- Legend -->
		<section class="mt-12 border-t pt-6">
			<h3 class="text-foreground mb-3 text-sm font-medium">{m.public_status_legend()}</h3>
			<div class="flex flex-wrap gap-4 text-sm">
				<div class="flex items-center gap-2">
					<div class="bg-status-up h-3 w-3 rounded-full"></div>
					<span class="text-muted-foreground">{m.public_status_legend_operational()}</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="bg-status-degraded h-3 w-3 rounded-full"></div>
					<span class="text-muted-foreground">{m.public_status_legend_degraded()}</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="bg-status-partial h-3 w-3 rounded-full"></div>
					<span class="text-muted-foreground">{m.public_status_legend_partial()}</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="bg-status-down h-3 w-3 rounded-full"></div>
					<span class="text-muted-foreground">{m.public_status_legend_down()}</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="bg-status-maintenance h-3 w-3 rounded-full"></div>
					<span class="text-muted-foreground">{m.public_status_legend_maintenance()}</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="bg-status-unknown h-3 w-3 rounded-full"></div>
					<span class="text-muted-foreground">{m.public_status_legend_no_data()}</span>
				</div>
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="bg-card border-t py-6">
		<div class="text-muted-foreground mx-auto max-w-4xl px-4 text-center text-sm">
			{m.public_status_footer()}
		</div>
	</footer>
</div>
