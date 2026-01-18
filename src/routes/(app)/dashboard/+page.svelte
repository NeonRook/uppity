<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Activity, TriangleAlert, CircleCheck, Clock, Plus } from '@lucide/svelte';
	import { formatUptime, formatResponseTime } from '$lib/format';
	import { getStatusColor, getStatusLabel } from '$lib/utils/status';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatCard from '$lib/components/stat-card.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>{m.dashboard_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.dashboard_title()}</h1>
			<p class="text-muted-foreground">{m.dashboard_subtitle()}</p>
		</div>
		<Button href="/monitors/new">
			<Plus class="mr-2 h-4 w-4" />
			{m.dashboard_add_monitor()}
		</Button>
	</div>

	<!-- Stats cards -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<StatCard
			title={m.dashboard_total_monitors()}
			value={data.stats.total}
			description={data.stats.total === 0
				? m.dashboard_no_monitors()
				: m.dashboard_active_monitoring()}
			icon={Activity}
		/>
		<StatCard
			title={m.dashboard_operational()}
			value={data.stats.operational}
			description={m.dashboard_all_operational()}
			icon={CircleCheck}
			iconClass="text-green-500"
		/>
		<StatCard
			title={m.dashboard_degraded()}
			value={data.stats.degraded}
			description={m.dashboard_experiencing_delays()}
			icon={Clock}
			iconClass="text-yellow-500"
		/>
		<StatCard
			title={m.dashboard_down()}
			value={data.stats.down}
			description={m.dashboard_requires_attention()}
			icon={TriangleAlert}
			iconClass="text-red-500"
		/>
	</div>

	<!-- Monitor list -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.dashboard_monitors()}</Card.Title>
			<Card.Description>{m.dashboard_monitors_overview()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.monitors.length === 0}
				<EmptyState
					icon={Activity}
					title={m.dashboard_no_monitors_title()}
					description={m.dashboard_no_monitors_desc()}
					buttonText={m.dashboard_add_first_monitor()}
					buttonHref="/monitors/new"
					withCard={false}
				/>
			{:else}
				<div class="space-y-3">
					{#each data.monitors as mon (mon.id)}
						<a
							href={resolve(`/monitors/${mon.id}`)}
							class="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
						>
							<div class="flex items-center gap-4">
								<div class={`h-3 w-3 rounded-full ${getStatusColor(mon.status, mon.active)}`}></div>
								<div>
									<div class="font-medium">{mon.name}</div>
									<div class="flex items-center gap-2 text-sm text-muted-foreground">
										<span class="text-xs uppercase">{mon.type}</span>
										{#if mon.url}
											<span>·</span>
											<span class="max-w-[200px] truncate">{mon.url}</span>
										{/if}
									</div>
								</div>
							</div>
							<div class="flex items-center gap-6 text-sm">
								<div class="text-right">
									<div class="font-mono">{formatUptime(mon.uptimePercent24h)}</div>
									<div class="text-xs text-muted-foreground">{m.dashboard_uptime()}</div>
								</div>
								<div class="text-right">
									<div class="font-mono">{formatResponseTime(mon.avgResponseTimeMs24h)}</div>
									<div class="text-xs text-muted-foreground">{m.dashboard_response()}</div>
								</div>
								<Badge
									variant={mon.active && mon.status === 'up'
										? 'default'
										: mon.active && mon.status === 'down'
											? 'destructive'
											: 'secondary'}
								>
									{getStatusLabel(mon.status, mon.active)}
								</Badge>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
