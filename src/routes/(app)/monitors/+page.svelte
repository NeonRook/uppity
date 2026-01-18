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
	import { formatResponseTime } from '$lib/format';
	import { getStatusBadge, getStatusColor } from '$lib/utils/status';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	function formatUptime(percent: number | null) {
		if (percent === null) return '-';
		return `${percent.toFixed(2)}%`;
	}

	function getEndpoint(mon: (typeof data.monitors)[number]) {
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
</script>

<svelte:head>
	<title>{m.monitors_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.monitors_title()}</h1>
			<p class="text-muted-foreground">{m.monitors_subtitle()}</p>
		</div>
		<Button href="/monitors/new">
			<Plus class="mr-2 h-4 w-4" />
			{m.monitors_add()}
		</Button>
	</div>

	{#if data.monitors.length === 0}
		<EmptyState
			icon={Activity}
			title={m.monitors_empty_title()}
			description={m.monitors_empty_desc()}
			buttonText={m.monitors_create()}
			buttonHref="/monitors/new"
		/>
	{:else}
		<Card.Root>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-[40px]"></Table.Head>
						<Table.Head>{m.monitors_table_name()}</Table.Head>
						<Table.Head>{m.monitors_table_endpoint()}</Table.Head>
						<Table.Head>{m.monitors_table_status()}</Table.Head>
						<Table.Head class="text-right">{m.monitors_table_uptime()}</Table.Head>
						<Table.Head class="text-right">{m.monitors_table_avg_response()}</Table.Head>
						<Table.Head class="w-[50px]"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.monitors as mon (mon.id)}
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
									<span>{getEndpoint(mon)}</span>
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
										<MoreHorizontal class="h-4 w-4" />
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
										<DropdownMenu.Item>
											{#if mon.active}
												<Pause class="mr-2 h-4 w-4" />
												{m.monitors_pause()}
											{:else}
												<Play class="mr-2 h-4 w-4" />
												{m.monitors_resume()}
											{/if}
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive">
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
