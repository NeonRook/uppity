<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import {
		ArrowLeft,
		ExternalLink,
		Settings,
		Pause,
		Play,
		CheckCircle,
		XCircle,
		Clock,
		AlertTriangle,
		Copy,
		Check
	} from '@lucide/svelte';
	import { page } from '$app/stores';

	interface Props {
		data: {
			monitor: {
				id: string;
				name: string;
				description: string | null;
				type: string;
				url: string | null;
				method: string | null;
				hostname: string | null;
				port: number | null;
				active: boolean;
				intervalSeconds: number;
				timeoutSeconds: number;
				retries: number;
				alertAfterFailures: number;
				pushToken: string | null;
				pushGracePeriodSeconds: number | null;
			};
			status: {
				status: string;
				lastCheckAt: Date | null;
				lastStatusChange: Date | null;
				consecutiveFailures: number;
				uptimePercent24h: number | null;
				avgResponseTimeMs24h: number | null;
			} | null;
			recentChecks: Array<{
				id: string;
				status: string;
				statusCode: number | null;
				responseTimeMs: number | null;
				errorMessage: string | null;
				checkedAt: Date;
			}>;
		};
	}

	let { data }: Props = $props();

	let copied = $state(false);

	const pushUrl = $derived(
		data.monitor.type === 'push' && data.monitor.pushToken
			? `${$page.url.origin}/api/webhooks/push/${data.monitor.pushToken}`
			: null
	);

	async function copyToClipboard(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function getStatusBadge(status: string | null, active: boolean) {
		if (!active) {
			return { variant: 'secondary' as const, label: 'Paused', icon: Pause };
		}
		switch (status) {
			case 'up':
				return { variant: 'default' as const, label: 'Operational', icon: CheckCircle };
			case 'degraded':
				return { variant: 'outline' as const, label: 'Degraded', icon: AlertTriangle };
			case 'down':
				return { variant: 'destructive' as const, label: 'Down', icon: XCircle };
			default:
				return { variant: 'secondary' as const, label: 'Unknown', icon: Clock };
		}
	}

	function getCheckIcon(status: string) {
		switch (status) {
			case 'up':
				return { component: CheckCircle, class: 'text-green-500' };
			case 'degraded':
				return { component: AlertTriangle, class: 'text-yellow-500' };
			case 'down':
				return { component: XCircle, class: 'text-red-500' };
			default:
				return { component: Clock, class: 'text-muted-foreground' };
		}
	}

	function formatDate(date: Date | null) {
		if (!date) return '-';
		return new Date(date).toLocaleString();
	}

	function formatResponseTime(ms: number | null) {
		if (ms === null) return '-';
		return `${ms}ms`;
	}

	function formatInterval(seconds: number) {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		return `${Math.floor(seconds / 3600)}h`;
	}

	const statusInfo = $derived(getStatusBadge(data.status?.status ?? null, data.monitor.active));
	const StatusIcon = $derived(statusInfo.icon);
</script>

<svelte:head>
	<title>{data.monitor.name} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="icon" href="/monitors">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div>
				<div class="flex items-center gap-3">
					<h1 class="text-3xl font-bold tracking-tight">{data.monitor.name}</h1>
					<Badge variant={statusInfo.variant}>
						<StatusIcon class="mr-1 h-3 w-3" />
						{statusInfo.label}
					</Badge>
				</div>
				{#if data.monitor.description}
					<p class="text-muted-foreground">{data.monitor.description}</p>
				{/if}
			</div>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" size="sm">
				{#if data.monitor.active}
					<Pause class="mr-2 h-4 w-4" />
					Pause
				{:else}
					<Play class="mr-2 h-4 w-4" />
					Resume
				{/if}
			</Button>
			<Button variant="outline" size="sm" href="/monitors/{data.monitor.id}/edit">
				<Settings class="mr-2 h-4 w-4" />
				Edit
			</Button>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="grid gap-4 md:grid-cols-4">
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium text-muted-foreground">Uptime (24h)</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">
					{data.status?.uptimePercent24h !== null
						? `${data.status?.uptimePercent24h?.toFixed(2)}%`
						: '-'}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium text-muted-foreground">Avg Response</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">
					{formatResponseTime(data.status?.avgResponseTimeMs24h ?? null)}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium text-muted-foreground">Last Check</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">
					{data.status?.lastCheckAt ? new Date(data.status.lastCheckAt).toLocaleTimeString() : '-'}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium text-muted-foreground">Check Interval</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{formatInterval(data.monitor.intervalSeconds)}</div>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Monitor Details -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Configuration</Card.Title>
		</Card.Header>
		<Card.Content>
			<dl class="grid gap-4 sm:grid-cols-2">
				<div>
					<dt class="text-sm font-medium text-muted-foreground">Type</dt>
					<dd class="mt-1 text-sm uppercase">{data.monitor.type}</dd>
				</div>

				{#if data.monitor.type === 'http' && data.monitor.url}
					<div>
						<dt class="text-sm font-medium text-muted-foreground">URL</dt>
						<dd class="mt-1 flex items-center gap-1 text-sm">
							<span class="font-mono">{data.monitor.url}</span>
							<a
								href={data.monitor.url}
								target="_blank"
								rel="external noopener noreferrer"
								class="text-muted-foreground hover:text-foreground"
							>
								<ExternalLink class="h-3 w-3" />
							</a>
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Method</dt>
						<dd class="mt-1 text-sm">{data.monitor.method}</dd>
					</div>
				{/if}

				{#if data.monitor.type === 'tcp'}
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Host</dt>
						<dd class="mt-1 font-mono text-sm">
							{data.monitor.hostname}:{data.monitor.port}
						</dd>
					</div>
				{/if}

				{#if data.monitor.type === 'push' && pushUrl}
					<div class="sm:col-span-2">
						<dt class="text-sm font-medium text-muted-foreground">Push URL</dt>
						<dd class="mt-1">
							<div class="flex items-center gap-2">
								<code class="flex-1 rounded bg-muted px-3 py-2 text-sm break-all">
									{pushUrl}
								</code>
								<Button variant="outline" size="sm" onclick={() => copyToClipboard(pushUrl)}>
									{#if copied}
										<Check class="h-4 w-4 text-green-500" />
									{:else}
										<Copy class="h-4 w-4" />
									{/if}
								</Button>
							</div>
							<p class="mt-2 text-xs text-muted-foreground">
								Send a GET, POST, or HEAD request to this URL to record a heartbeat. The monitor
								will be marked as down if no heartbeat is received within
								{data.monitor.intervalSeconds + (data.monitor.pushGracePeriodSeconds || 60)} seconds (interval
								+ grace period).
							</p>
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Grace Period</dt>
						<dd class="mt-1 text-sm">{data.monitor.pushGracePeriodSeconds || 60}s</dd>
					</div>
				{/if}

				<div>
					<dt class="text-sm font-medium text-muted-foreground">Timeout</dt>
					<dd class="mt-1 text-sm">{data.monitor.timeoutSeconds}s</dd>
				</div>

				<div>
					<dt class="text-sm font-medium text-muted-foreground">Retries</dt>
					<dd class="mt-1 text-sm">{data.monitor.retries}</dd>
				</div>

				<div>
					<dt class="text-sm font-medium text-muted-foreground">Alert After Failures</dt>
					<dd class="mt-1 text-sm">{data.monitor.alertAfterFailures}</dd>
				</div>
			</dl>
		</Card.Content>
	</Card.Root>

	<!-- Recent Checks -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Recent Checks</Card.Title>
			<Card.Description>Last 50 health checks</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.recentChecks.length === 0}
				<p class="py-8 text-center text-muted-foreground">No checks recorded yet</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-[40px]"></Table.Head>
							<Table.Head>Time</Table.Head>
							<Table.Head>Status Code</Table.Head>
							<Table.Head class="text-right">Response Time</Table.Head>
							<Table.Head>Error</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.recentChecks as check (check.id)}
							{@const iconInfo = getCheckIcon(check.status)}
							{@const CheckIcon = iconInfo.component}
							<Table.Row>
								<Table.Cell>
									<CheckIcon class="h-4 w-4 {iconInfo.class}" />
								</Table.Cell>
								<Table.Cell class="font-mono text-sm">
									{formatDate(check.checkedAt)}
								</Table.Cell>
								<Table.Cell>
									{check.statusCode ?? '-'}
								</Table.Cell>
								<Table.Cell class="text-right font-mono text-sm">
									{formatResponseTime(check.responseTimeMs)}
								</Table.Cell>
								<Table.Cell class="max-w-[200px] truncate text-sm text-muted-foreground">
									{check.errorMessage || '-'}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
