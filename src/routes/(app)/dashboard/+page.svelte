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

	let { data } = $props();
</script>

<svelte:head>
	<title>Dashboard - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
			<p class="text-muted-foreground">Monitor the health of all your services</p>
		</div>
		<Button href="/monitors/new">
			<Plus class="mr-2 h-4 w-4" />
			Add Monitor
		</Button>
	</div>

	<!-- Stats cards -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<StatCard
			title="Total Monitors"
			value={data.stats.total}
			description={data.stats.total === 0 ? 'No monitors configured yet' : 'Active monitoring'}
			icon={Activity}
		/>
		<StatCard
			title="Operational"
			value={data.stats.operational}
			description="All systems operational"
			icon={CircleCheck}
			iconClass="text-green-500"
		/>
		<StatCard
			title="Degraded"
			value={data.stats.degraded}
			description="Experiencing delays"
			icon={Clock}
			iconClass="text-yellow-500"
		/>
		<StatCard
			title="Down"
			value={data.stats.down}
			description="Requires attention"
			icon={TriangleAlert}
			iconClass="text-red-500"
		/>
	</div>

	<!-- Monitor list -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Monitors</Card.Title>
			<Card.Description>Overview of all your monitored endpoints</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.monitors.length === 0}
				<EmptyState
					icon={Activity}
					title="No monitors yet"
					description="Get started by adding your first monitor to track uptime."
					buttonText="Add your first monitor"
					buttonHref="/monitors/new"
					withCard={false}
				/>
			{:else}
				<div class="space-y-3">
					{#each data.monitors as m (m.id)}
						<a
							href={resolve(`/monitors/${m.id}`)}
							class="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
						>
							<div class="flex items-center gap-4">
								<div class={`h-3 w-3 rounded-full ${getStatusColor(m.status, m.active)}`}></div>
								<div>
									<div class="font-medium">{m.name}</div>
									<div class="flex items-center gap-2 text-sm text-muted-foreground">
										<span class="text-xs uppercase">{m.type}</span>
										{#if m.url}
											<span>·</span>
											<span class="max-w-[200px] truncate">{m.url}</span>
										{/if}
									</div>
								</div>
							</div>
							<div class="flex items-center gap-6 text-sm">
								<div class="text-right">
									<div class="font-mono">{formatUptime(m.uptimePercent24h)}</div>
									<div class="text-xs text-muted-foreground">uptime</div>
								</div>
								<div class="text-right">
									<div class="font-mono">{formatResponseTime(m.avgResponseTimeMs24h)}</div>
									<div class="text-xs text-muted-foreground">response</div>
								</div>
								<Badge
									variant={m.active && m.status === 'up'
										? 'default'
										: m.active && m.status === 'down'
											? 'destructive'
											: 'secondary'}
								>
									{getStatusLabel(m.status, m.active)}
								</Badge>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
