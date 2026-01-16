<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import {
		Plus,
		Activity,
		ExternalLink,
		MoreHorizontal,
		Pause,
		Play,
		Trash2
	} from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	interface Props {
		data: {
			monitors: Array<{
				id: string;
				name: string;
				description: string | null;
				type: string;
				url: string | null;
				hostname: string | null;
				port: number | null;
				active: boolean;
				intervalSeconds: number;
				createdAt: Date;
				status: string | null;
				lastCheckAt: Date | null;
				consecutiveFailures: number | null;
				uptimePercent24h: number | null;
				avgResponseTimeMs24h: number | null;
			}>;
		};
	}

	let { data }: Props = $props();

	function getStatusBadge(status: string | null, active: boolean) {
		if (!active) {
			return { variant: 'secondary' as const, label: 'Paused' };
		}
		switch (status) {
			case 'up':
				return { variant: 'default' as const, label: 'Operational' };
			case 'degraded':
				return { variant: 'outline' as const, label: 'Degraded' };
			case 'down':
				return { variant: 'destructive' as const, label: 'Down' };
			default:
				return { variant: 'secondary' as const, label: 'Unknown' };
		}
	}

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

	function formatUptime(percent: number | null) {
		if (percent === null) return '-';
		return `${percent.toFixed(2)}%`;
	}

	function formatResponseTime(ms: number | null) {
		if (ms === null) return '-';
		return `${ms}ms`;
	}

	function getEndpoint(m: Props['data']['monitors'][0]) {
		if (m.type === 'http' && m.url) {
			try {
				const url = new URL(m.url);
				return url.hostname;
			} catch {
				return m.url;
			}
		}
		if (m.type === 'tcp' && m.hostname) {
			return `${m.hostname}:${m.port}`;
		}
		return '-';
	}
</script>

<svelte:head>
	<title>Monitors - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Monitors</h1>
			<p class="text-muted-foreground">Manage your uptime monitors</p>
		</div>
		<Button href="/monitors/new">
			<Plus class="mr-2 h-4 w-4" />
			Add Monitor
		</Button>
	</div>

	{#if data.monitors.length === 0}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<Activity class="h-12 w-12 text-muted-foreground/50" />
					<h3 class="mt-4 text-lg font-semibold">No monitors yet</h3>
					<p class="mt-2 mb-4 text-sm text-muted-foreground">
						Create your first monitor to start tracking uptime.
					</p>
					<Button href="/monitors/new">
						<Plus class="mr-2 h-4 w-4" />
						Create Monitor
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-[40px]"></Table.Head>
						<Table.Head>Name</Table.Head>
						<Table.Head>Endpoint</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="text-right">Uptime (24h)</Table.Head>
						<Table.Head class="text-right">Avg Response</Table.Head>
						<Table.Head class="w-[50px]"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.monitors as m (m.id)}
						{@const statusInfo = getStatusBadge(m.status, m.active)}
						<Table.Row>
							<Table.Cell>
								<div class="flex items-center">
									<div class={`h-2 w-2 rounded-full ${getStatusColor(m.status, m.active)}`}></div>
								</div>
							</Table.Cell>
							<Table.Cell>
								<a href={resolve(`/monitors/${m.id}`)} class="font-medium hover:underline"
									>{m.name}</a
								>
								{#if m.description}
									<p class="text-xs text-muted-foreground">{m.description}</p>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-1 text-sm text-muted-foreground">
									<span class="text-xs uppercase">{m.type}</span>
									<span class="mx-1">·</span>
									<span>{getEndpoint(m)}</span>
									{#if m.type === 'http' && m.url}
										<a
											href={m.url}
											target="_blank"
											rel="external noopener noreferrer"
											class="text-muted-foreground hover:text-foreground"
										>
											<ExternalLink class="h-3 w-3" />
										</a>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
							</Table.Cell>
							<Table.Cell class="text-right font-mono text-sm">
								{formatUptime(m.uptimePercent24h)}
							</Table.Cell>
							<Table.Cell class="text-right font-mono text-sm">
								{formatResponseTime(m.avgResponseTimeMs24h)}
							</Table.Cell>
							<Table.Cell>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger class="rounded p-1 hover:bg-muted">
										<MoreHorizontal class="h-4 w-4" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item>
											<a href={resolve(`/monitors/${m.id}`)} class="flex w-full items-center">
												View Details
											</a>
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											<a href={resolve(`/monitors/${m.id}/edit`)} class="flex w-full items-center">
												Edit
											</a>
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item>
											{#if m.active}
												<Pause class="mr-2 h-4 w-4" />
												Pause
											{:else}
												<Play class="mr-2 h-4 w-4" />
												Resume
											{/if}
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive">
											<Trash2 class="mr-2 h-4 w-4" />
											Delete
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Root>
	{/if}
</div>
