<script lang="ts">
	import { resolve } from '$app/paths';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import EmptyState from '$lib/components/empty-state.svelte';
	import MonitorsListSkeleton from '$lib/components/monitors-list-skeleton.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Table from '$lib/components/ui/table';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { formatResponseTime } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';
	import { getMonitors, toggleMonitor, deleteMonitor } from '$lib/remote/monitors.remote';
	import { getStatusBadge, getStatusColor } from '$lib/utils/status';
	import {
		Activity,
		ExternalLink,
		LoaderCircle,
		Ellipsis,
		Pause,
		Play,
		Plus,
		RefreshCw,
		Trash2
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	type MonitorWithStatus = Awaited<ReturnType<typeof getMonitors>>[number];

	let { data } = $props();
	const monitorsQuery = getMonitors();

	// Usage limits from parent layout (self-hosted has no limits)
	const usageLimits = $derived(data.usageLimits);
	const canAddMonitor = $derived(data.selfHosted || (usageLimits?.monitors.canAdd ?? true));
	const monitorUsageText = $derived(
		!data.selfHosted && usageLimits
			? `${usageLimits.monitors.current}/${usageLimits.monitors.limit === -1 ? '∞' : usageLimits.monitors.limit}`
			: null
	);

	// Prefer query data (after refresh/mutation), fallback to preloaded data
	const monitors = $derived(monitorsQuery.current ?? data.monitors);

	let deleteMonitorId = $state<string | null>(null);
	let togglingMonitorId = $state<string | null>(null);

	function formatUptime(percent: number | null) {
		if (percent === null) return '-';
		return `${percent.toFixed(2)}%`;
	}

	function getEndpoint(mon: MonitorWithStatus) {
		if (mon.type === 'http' && mon.url) {
			try {
				const url = new URL(mon.url);
				return url.hostname;
			} catch {
				return mon.url;
			}
		}
		if (mon.type === 'tcp' && mon.hostname) {
			return `${mon.hostname}:${mon.port}`;
		}
		return '-';
	}

	async function handleToggle(monitorId: string, currentActive: boolean) {
		togglingMonitorId = monitorId;
		try {
			await toggleMonitor({ monitorId }).updates(
				getMonitors().withOverride((prev) =>
					prev.map((mon) => (mon.id === monitorId ? { ...mon, active: !currentActive } : mon))
				)
			);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to toggle monitor');
		} finally {
			togglingMonitorId = null;
		}
	}

	async function handleDelete(monitorId: string) {
		await deleteMonitor({ monitorId }).updates(
			getMonitors().withOverride((prev) => prev.filter((mon) => mon.id !== monitorId))
		);
	}
</script>

<svelte:head>
	<title>{m.monitors_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.monitors_title()}</h1>
			<p class="text-muted-foreground">{m.monitors_subtitle()}</p>
		</div>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				onclick={() => monitorsQuery.refresh()}
				disabled={monitorsQuery.loading}
			>
				<RefreshCw class={`h-4 w-4 ${monitorsQuery.loading ? 'animate-spin' : ''}`} />
			</Button>
			{#if monitorUsageText}
				<Badge variant="outline" class="hidden text-xs font-normal sm:inline-flex">
					{monitorUsageText} monitors
				</Badge>
			{/if}
			{#if canAddMonitor}
				<Button href="/monitors/new">
					<Plus class="mr-2 h-4 w-4" />
					{m.monitors_add()}
				</Button>
			{:else}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button disabled>
							<Plus class="mr-2 h-4 w-4" />
							{m.monitors_add()}
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>Monitor limit reached. Upgrade to add more.</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
	</div>

	{#if monitorsQuery.loading && !monitors}
		<MonitorsListSkeleton />
	{:else if monitorsQuery.error}
		<Card.Root>
			<Card.Content class="p-6">
				<p class="text-destructive">Failed to load monitors: {monitorsQuery.error.message}</p>
			</Card.Content>
		</Card.Root>
	{:else if monitors.length === 0}
		<EmptyState
			icon={Activity}
			title={m.monitors_empty_title()}
			description={m.monitors_empty_desc()}
			buttonText={m.monitors_create()}
			buttonHref="/monitors/new"
			buttonDisabled={!canAddMonitor}
			buttonDisabledMessage="Monitor limit reached. Upgrade to add more."
		/>
	{:else}
		<!-- Mobile card view -->
		<div class="space-y-3 md:hidden">
			{#each monitors as mon (mon.id)}
				{@const statusInfo = getStatusBadge(mon.status, mon.active)}
				<Card.Root>
					<Card.Content class="p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<div
										class={`h-2 w-2 shrink-0 rounded-full ${getStatusColor(mon.status, mon.active)}`}
									></div>
									<a
										href={resolve(`/monitors/${mon.id}`)}
										class="truncate font-medium hover:underline"
									>
										{mon.name}
									</a>
								</div>
								<p class="mt-1 truncate text-sm text-muted-foreground">
									<span class="text-xs uppercase">{mon.type}</span>
									<span class="mx-1">·</span>
									<span>{getEndpoint(mon)}</span>
								</p>
								<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
									<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
									<span class="font-mono text-muted-foreground">
										{formatUptime(mon.uptimePercent24h)}
									</span>
									<span class="font-mono text-muted-foreground">
										{formatResponseTime(mon.avgResponseTimeMs24h)}
									</span>
								</div>
							</div>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger class="shrink-0 rounded p-1 hover:bg-muted">
									<Ellipsis class="h-4 w-4" />
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item>
										<a href={resolve(`/monitors/${mon.id}`)} class="flex w-full items-center">
											{m.monitors_view_details()}
										</a>
									</DropdownMenu.Item>
									<DropdownMenu.Item>
										<a href={resolve(`/monitors/${mon.id}/edit`)} class="flex w-full items-center">
											{m.common_edit()}
										</a>
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										onclick={() => handleToggle(mon.id, mon.active)}
										disabled={togglingMonitorId === mon.id}
									>
										{#if togglingMonitorId === mon.id}
											<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
										{:else if mon.active}
											<Pause class="mr-2 h-4 w-4" />
										{:else}
											<Play class="mr-2 h-4 w-4" />
										{/if}
										{mon.active ? m.monitors_pause() : m.monitors_resume()}
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										variant="destructive"
										onclick={() => (deleteMonitorId = mon.id)}
									>
										<Trash2 class="mr-2 h-4 w-4" />
										{m.common_delete()}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>

		<!-- Desktop table view -->
		<Card.Root class="hidden md:block">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-10"></Table.Head>
						<Table.Head>{m.monitors_table_name()}</Table.Head>
						<Table.Head>{m.monitors_table_endpoint()}</Table.Head>
						<Table.Head>{m.monitors_table_status()}</Table.Head>
						<Table.Head class="text-right">{m.monitors_table_uptime()}</Table.Head>
						<Table.Head class="text-right">{m.monitors_table_avg_response()}</Table.Head>
						<Table.Head class="w-12.5"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each monitors as mon (mon.id)}
						{@const statusInfo = getStatusBadge(mon.status, mon.active)}
						<Table.Row>
							<Table.Cell>
								<div class="flex items-center">
									<div
										class={`h-2 w-2 rounded-full ${getStatusColor(mon.status, mon.active)}`}
									></div>
								</div>
							</Table.Cell>
							<Table.Cell>
								<a href={resolve(`/monitors/${mon.id}`)} class="font-medium hover:underline"
									>{mon.name}</a
								>
								{#if mon.description}
									<p class="text-xs text-muted-foreground">{mon.description}</p>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-1 text-sm text-muted-foreground">
									<span class="text-xs uppercase">{mon.type}</span>
									<span class="mx-1">·</span>
									<span class="truncate">{getEndpoint(mon)}</span>
									{#if mon.type === 'http' && mon.url}
										<a
											href={mon.url}
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
								{formatUptime(mon.uptimePercent24h)}
							</Table.Cell>
							<Table.Cell class="text-right font-mono text-sm">
								{formatResponseTime(mon.avgResponseTimeMs24h)}
							</Table.Cell>
							<Table.Cell>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger class="rounded p-1 hover:bg-muted">
										<Ellipsis class="h-4 w-4" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item>
											<a href={resolve(`/monitors/${mon.id}`)} class="flex w-full items-center">
												{m.monitors_view_details()}
											</a>
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											<a
												href={resolve(`/monitors/${mon.id}/edit`)}
												class="flex w-full items-center"
											>
												{m.common_edit()}
											</a>
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											onclick={() => handleToggle(mon.id, mon.active)}
											disabled={togglingMonitorId === mon.id}
										>
											{#if togglingMonitorId === mon.id}
												<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
											{:else if mon.active}
												<Pause class="mr-2 h-4 w-4" />
											{:else}
												<Play class="mr-2 h-4 w-4" />
											{/if}
											{mon.active ? m.monitors_pause() : m.monitors_resume()}
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											variant="destructive"
											onclick={() => (deleteMonitorId = mon.id)}
										>
											<Trash2 class="mr-2 h-4 w-4" />
											{m.common_delete()}
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

<DeleteDialog
	itemId={deleteMonitorId}
	onOpenChange={() => (deleteMonitorId = null)}
	onDelete={handleDelete}
	title={m.monitors_delete_title()}
	description={m.monitors_delete_desc()}
/>
