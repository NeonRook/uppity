<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { formatDate, formatResponseTime, formatInterval } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';
	import { getStatusBadgeWithIcon, getCheckIcon } from '$lib/utils/status';
	import {
		Check,
		Copy,
		ExternalLink,
		Pause,
		Play,
		Settings,
		ShieldAlert,
		ShieldCheck,
		ShieldX,
		Trash2
	} from '@lucide/svelte';

	let { data } = $props();

	let copied = $state(false);
	let showDeleteDialog = $state(false);

	const pushUrl = $derived(
		data.monitor.type === 'push' && data.monitor.pushToken
			? `${page.url.origin}/api/webhooks/push/${data.monitor.pushToken}`
			: null
	);

	async function copyToClipboard(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	const statusInfo = $derived(
		getStatusBadgeWithIcon(data.status?.status ?? null, data.monitor.active)
	);
	const StatusIcon = $derived(statusInfo.icon);

	function getDaysUntilExpiry(expiresAt: Date | null): number | null {
		if (!expiresAt) return null;
		const now = new Date();
		const expiry = new Date(expiresAt);
		const diffMs = expiry.getTime() - now.getTime();
		return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
	}

	function getSslStatus(daysUntil: number | null, threshold: number | null) {
		if (daysUntil === null) {
			return { variant: 'secondary' as const, label: m.monitor_ssl_unknown(), icon: ShieldX };
		}
		if (daysUntil <= 0) {
			return { variant: 'destructive' as const, label: m.monitor_ssl_expired(), icon: ShieldX };
		}
		if (daysUntil <= (threshold ?? 14)) {
			return {
				variant: 'outline' as const,
				label: m.monitor_ssl_expiring_soon(),
				icon: ShieldAlert
			};
		}
		return { variant: 'default' as const, label: m.monitor_ssl_valid(), icon: ShieldCheck };
	}

	// SSL info comes from the most recent check
	const latestSslInfo = $derived(data.recentChecks[0] ?? null);
	const sslDaysUntilExpiry = $derived(getDaysUntilExpiry(latestSslInfo?.sslExpiresAt ?? null));
	const sslStatus = $derived(
		getSslStatus(sslDaysUntilExpiry, data.monitor.sslExpiryThresholdDays ?? null)
	);
	const SslIcon = $derived(sslStatus.icon);
</script>

<svelte:head>
	<title>{data.monitor.name} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader backHref="/monitors">
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
		{#snippet actions()}
			<div class="flex gap-2">
				<form method="POST" action="?/toggle" use:enhance>
					<input type="hidden" name="monitorId" value={data.monitor.id} />
					<Button type="submit" variant="outline" size="sm">
						{#if data.monitor.active}
							<Pause class="mr-2 h-4 w-4" />
							{m.monitors_pause()}
						{:else}
							<Play class="mr-2 h-4 w-4" />
							{m.monitors_resume()}
						{/if}
					</Button>
				</form>
				<Button variant="outline" size="sm" href="/monitors/{data.monitor.id}/edit">
					<Settings class="mr-2 h-4 w-4" />
					{m.common_edit()}
				</Button>
				<Button variant="destructive" size="sm" onclick={() => (showDeleteDialog = true)}>
					<Trash2 class="mr-2 h-4 w-4" />
					{m.common_delete()}
				</Button>
			</div>
		{/snippet}
	</PageHeader>

	<!-- Stats Cards -->
	<div class="grid gap-4 md:grid-cols-4">
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium text-muted-foreground"
					>{m.monitor_uptime_24h()}</Card.Title
				>
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
				<Card.Title class="text-sm font-medium text-muted-foreground"
					>{m.monitor_avg_response()}</Card.Title
				>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">
					{formatResponseTime(data.status?.avgResponseTimeMs24h ?? null)}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium text-muted-foreground"
					>{m.monitor_last_check()}</Card.Title
				>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">
					{data.status?.lastCheckAt ? new Date(data.status.lastCheckAt).toLocaleTimeString() : '-'}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium text-muted-foreground"
					>{m.monitor_check_interval()}</Card.Title
				>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{formatInterval(data.monitor.intervalSeconds)}</div>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Monitor Details -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.monitor_configuration()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<dl class="grid gap-4 sm:grid-cols-2">
				<div>
					<dt class="text-sm font-medium text-muted-foreground">{m.common_type()}</dt>
					<dd class="mt-1 text-sm uppercase">{data.monitor.type}</dd>
				</div>

				{#if data.monitor.type === 'http' && data.monitor.url}
					<div>
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_url()}</dt>
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
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_http_method()}</dt>
						<dd class="mt-1 text-sm">{data.monitor.method}</dd>
					</div>
				{/if}

				{#if data.monitor.type === 'tcp'}
					<div>
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_hostname()}</dt>
						<dd class="mt-1 font-mono text-sm">
							{data.monitor.hostname}:{data.monitor.port}
						</dd>
					</div>
				{/if}

				{#if data.monitor.type === 'push' && pushUrl}
					<div class="sm:col-span-2">
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_push_url()}</dt>
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
								{m.monitor_push_url_desc({
									seconds:
										data.monitor.intervalSeconds + (data.monitor.pushGracePeriodSeconds || 60)
								})}
							</p>
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_grace_period()}</dt>
						<dd class="mt-1 text-sm">{data.monitor.pushGracePeriodSeconds || 60}s</dd>
					</div>
				{/if}

				<div>
					<dt class="text-sm font-medium text-muted-foreground">{m.monitor_timeout()}</dt>
					<dd class="mt-1 text-sm">{data.monitor.timeoutSeconds}s</dd>
				</div>

				<div>
					<dt class="text-sm font-medium text-muted-foreground">{m.monitor_retries()}</dt>
					<dd class="mt-1 text-sm">{data.monitor.retries}</dd>
				</div>

				<div>
					<dt class="text-sm font-medium text-muted-foreground">{m.monitor_alert_after()}</dt>
					<dd class="mt-1 text-sm">{data.monitor.alertAfterFailures}</dd>
				</div>
			</dl>
		</Card.Content>
	</Card.Root>

	<!-- SSL Certificate -->
	{#if data.monitor.type === 'http' && data.monitor.sslCheckEnabled}
		<Card.Root>
			<Card.Header>
				<div class="flex items-center justify-between">
					<Card.Title>{m.monitor_ssl_certificate()}</Card.Title>
					<Badge variant={sslStatus.variant}>
						<SslIcon class="mr-1 h-3 w-3" />
						{sslStatus.label}
					</Badge>
				</div>
			</Card.Header>
			<Card.Content>
				<dl class="grid gap-4 sm:grid-cols-2">
					<div>
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_ssl_expires()}</dt>
						<dd class="mt-1 text-sm">
							{#if latestSslInfo?.sslExpiresAt}
								{new Date(latestSslInfo.sslExpiresAt).toLocaleDateString(undefined, {
									year: 'numeric',
									month: 'long',
									day: 'numeric'
								})}
							{:else}
								-
							{/if}
						</dd>
					</div>

					<div>
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_ssl_days_until()}</dt>
						<dd class="mt-1 text-sm">
							{#if sslDaysUntilExpiry !== null}
								<span
									class={sslDaysUntilExpiry <= 0
										? 'font-medium text-red-500'
										: sslDaysUntilExpiry <= (data.monitor.sslExpiryThresholdDays ?? 14)
											? 'font-medium text-yellow-500'
											: ''}
								>
									{sslDaysUntilExpiry <= 0
										? m.monitor_ssl_expired_ago({ days: Math.abs(sslDaysUntilExpiry) })
										: m.monitor_ssl_days({ days: sslDaysUntilExpiry })}
								</span>
							{:else}
								-
							{/if}
						</dd>
					</div>

					<div>
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_ssl_issuer()}</dt>
						<dd class="mt-1 text-sm">{latestSslInfo?.sslIssuer || '-'}</dd>
					</div>

					<div>
						<dt class="text-sm font-medium text-muted-foreground">{m.monitor_ssl_threshold()}</dt>
						<dd class="mt-1 text-sm">
							{m.monitor_ssl_days({ days: data.monitor.sslExpiryThresholdDays ?? 14 })}
						</dd>
					</div>
				</dl>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Recent Checks -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.monitor_recent_checks()}</Card.Title>
			<Card.Description>{m.monitor_recent_checks_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.recentChecks.length === 0}
				<p class="py-8 text-center text-muted-foreground">{m.monitor_no_checks()}</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-10"></Table.Head>
							<Table.Head>{m.monitor_table_time()}</Table.Head>
							<Table.Head>{m.monitor_table_status_code()}</Table.Head>
							<Table.Head class="text-right">{m.monitor_table_response_time()}</Table.Head>
							<Table.Head>{m.monitor_table_error()}</Table.Head>
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
								<Table.Cell class="max-w-50 truncate text-sm text-muted-foreground">
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

<DeleteDialog
	open={showDeleteDialog}
	onOpenChange={(open) => (showDeleteDialog = open)}
	title={m.monitors_delete_title()}
	description={m.monitors_delete_desc()}
/>
