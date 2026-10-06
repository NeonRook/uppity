<script lang="ts">
	import { resolve } from "$app/paths";
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

	import IncidentTimeline from "#lib/components/incident-timeline.svelte";
	import StatusPageShell from "#lib/components/status-page-shell.svelte";
	import UptimeBar from "#lib/components/uptime-bar.svelte";
	import { formatDuration } from "#lib/format.js";
	import { getStatusInfo, getImpactInfo, formatIncidentDateTime } from "#lib/incidents.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getMonitorStatusColor } from "#lib/utils/status.js";

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

	// Class strings stay literal so Tailwind sees them.
	const overallInfo = $derived({
		operational: {
			label: m.public_status_all_operational(),
			icon: CircleCheckBig,
			cls: "bg-status-up text-status-up-foreground",
		},
		degraded: {
			label: m.public_status_degraded(),
			icon: TriangleAlert,
			cls: "bg-status-degraded text-status-degraded-foreground",
		},
		partial_outage: {
			label: m.public_status_partial(),
			icon: CircleMinus,
			cls: "bg-status-partial text-status-partial-foreground",
		},
		major_outage: {
			label: m.public_status_major(),
			icon: CircleX,
			cls: "bg-status-down text-status-down-foreground",
		},
		under_maintenance: {
			label: m.public_status_under_maintenance(),
			icon: Wrench,
			cls: "bg-status-maintenance text-status-maintenance-foreground",
		},
	});
	const statusInfo = $derived(overallInfo[overallStatus]);

	type Maintenance = (typeof activeMaintenance)[number];
	const maintenanceSections = $derived([
		{
			items: activeMaintenance,
			title: m.public_status_active_maintenance(),
			icon: Wrench,
			boxCls: "border-status-maintenance/40 bg-status-maintenance-surface",
			iconCls: "text-status-maintenance",
			headline: (w: Maintenance) => m.public_status_maintenance_active({ name: w.name }),
			detail: (w: Maintenance) =>
				m.public_status_maintenance_ends({ time: new Date(w.endsAt).toLocaleString() }),
		},
		{
			items: upcomingMaintenance,
			title: m.public_status_upcoming_maintenance(),
			icon: Clock,
			boxCls: "border-status-maintenance/25 bg-status-maintenance-surface/60",
			iconCls: "text-status-maintenance/70",
			headline: (w: Maintenance) => m.public_status_maintenance_scheduled({ name: w.name }),
			detail: (w: Maintenance) =>
				m.public_status_maintenance_window({
					startTime: new Date(w.startsAt).toLocaleString(),
					endTime: new Date(w.endsAt).toLocaleString(),
				}),
		},
	]);

	const legend = $derived([
		{ cls: "bg-status-up", label: m.public_status_legend_operational() },
		{ cls: "bg-status-degraded", label: m.public_status_legend_degraded() },
		{ cls: "bg-status-partial", label: m.public_status_legend_partial() },
		{ cls: "bg-status-down", label: m.public_status_legend_down() },
		{ cls: "bg-status-maintenance", label: m.public_status_legend_maintenance() },
		{ cls: "bg-status-unknown", label: m.public_status_legend_no_data() },
	]);
</script>

<StatusPageShell {page} title={m.public_status_page_title({ name: page.name })}>
	<!-- Overall Status Banner -->
	<div class="mb-8 rounded-lg {statusInfo.cls} p-6">
		<div class="flex items-center gap-3">
			<statusInfo.icon class="h-8 w-8" />
			<span class="text-2xl font-semibold">{statusInfo.label}</span>
		</div>
	</div>

	{#each maintenanceSections as section (section.title)}
		{#if section.items.length > 0}
			<section class="mb-8">
				<h2 class="text-foreground mb-4 text-lg font-semibold">{section.title}</h2>
				<div class="space-y-3">
					{#each section.items as w (w.id)}
						<div class="{section.boxCls} flex items-start gap-3 rounded-lg border p-4">
							<section.icon class="{section.iconCls} mt-0.5 h-5 w-5" />
							<div class="flex-1">
								<div class="text-foreground font-medium">{section.headline(w)}</div>
								{#if w.description}
									<p class="text-muted-foreground mt-1 text-sm">{w.description}</p>
								{/if}
								<p class="text-muted-foreground mt-1 text-xs">{section.detail(w)}</p>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/each}

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
						href={resolve(`status/${page.slug}/incidents/${incident.id}`)}
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
							<div class="border-border mt-4 border-t pt-4">
								<IncidentTimeline updates={timelineUpdates} limit={3} />
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
						<UptimeBar
							name={monitor.name}
							percent={monitor.uptimePercent90d}
							days={monitor.dailyHistory}
							dotClass={getMonitorStatusColor(monitor.status)}
						/>
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
							<UptimeBar
								name={monitor.name}
								percent={monitor.uptimePercent90d}
								days={monitor.dailyHistory}
								dotClass={getMonitorStatusColor(monitor.status)}
							/>
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
						href={resolve(`status/${page.slug}/incidents/${incident.id}`)}
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
			{#each legend as item (item.label)}
				<div class="flex items-center gap-2">
					<div class="{item.cls} h-3 w-3 rounded-full"></div>
					<span class="text-muted-foreground">{item.label}</span>
				</div>
			{/each}
		</div>
	</section>
</StatusPageShell>
