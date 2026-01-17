<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Activity, TriangleAlert, CircleCheck, Clock, Plus } from '@lucide/svelte';

	let { data } = $props();

	function getStatusColor(status: string | null, active: boolean) {
		if (!active) return 'bg-muted';
		switch (status) {
			case 'up':
				return 'bg-green-500';
			case 'degraded':
				return 'bg-yellow-500';
			case 'down':
				return 'bg-red-500';
			default:
				return 'bg-muted';
		}
	}

	function getStatusLabel(status: string | null, active: boolean) {
		if (!active) return 'Paused';
		switch (status) {
			case 'up':
				return 'Operational';
			case 'degraded':
				return 'Degraded';
			case 'down':
				return 'Down';
			default:
				return 'Unknown';
		}
	}

	function formatUptime(percent: number | null) {
		if (percent === null) return '-';
		return `${percent.toFixed(1)}%`;
	}

	function formatResponseTime(ms: number | null) {
		if (ms === null) return '-';
		return `${ms}ms`;
	}
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
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Total Monitors</Card.Title>
				<Activity class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.total}</div>
				<p class="text-xs text-muted-foreground">
					{data.stats.total === 0 ? 'No monitors configured yet' : 'Active monitoring'}
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Operational</Card.Title>
				<CircleCheck class="h-4 w-4 text-green-500" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.operational}</div>
				<p class="text-xs text-muted-foreground">All systems operational</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Degraded</Card.Title>
				<Clock class="h-4 w-4 text-yellow-500" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.degraded}</div>
				<p class="text-xs text-muted-foreground">Experiencing delays</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Down</Card.Title>
				<TriangleAlert class="h-4 w-4 text-red-500" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.down}</div>
				<p class="text-xs text-muted-foreground">Requires attention</p>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Monitor list -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Monitors</Card.Title>
			<Card.Description>Overview of all your monitored endpoints</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.monitors.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<Activity class="h-12 w-12 text-muted-foreground/50" />
					<h3 class="mt-4 text-lg font-semibold">No monitors yet</h3>
					<p class="mt-2 mb-4 text-sm text-muted-foreground">
						Get started by adding your first monitor to track uptime.
					</p>
					<Button href="/monitors/new">
						<Plus class="mr-2 h-4 w-4" />
						Add your first monitor
					</Button>
				</div>
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
