<script lang="ts">
	import { goto, refreshAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import {
		BellOff,
		Check,
		Copy,
		EyeOff,
		ExternalLink,
		LoaderCircle,
		Pause,
		Play,
		Settings,
		ShieldAlert,
		ShieldCheck,
		ShieldX,
		Trash2,
	} from "@lucide/svelte";
	import { toast } from "svelte-sonner";

	import DeleteDialog from "#lib/components/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Table from "#lib/components/ui/table/index.js";
	import {
		formatDate,
		formatDateTimeShort,
		formatResponseTime,
		formatInterval,
		formatUptime,
	} from "#lib/format.js";
	import { getChannelType } from "#lib/notifications.js";
	import { m } from "#lib/paraglide/messages.js";
	import { toggleMonitor, deleteMonitor } from "#lib/remote/monitors.remote.js";
	import { getStatusBadgeWithIcon, getCheckIcon, uncheckedSummary } from "#lib/utils/status.js";

	let { data } = $props();

	let copied = $state(false);
	let showDeleteDialog = $state(false);
	let toggling = $state(false);

	const pushUrl = $derived(
		data.monitor.type === "push" && data.monitor.pushToken
			? `${page.url.origin}/api/webhooks/push/${data.monitor.pushToken}`
			: null,
	);

	async function copyToClipboard(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function handleToggle() {
		toggling = true;
		try {
			await toggleMonitor({ monitorId: data.monitor.id });
			await refreshAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to toggle monitor");
		} finally {
			toggling = false;
		}
	}

	async function handleDelete() {
		await deleteMonitor({ monitorId: data.monitor.id });
		goto(resolve("monitors"));
	}

	const sslExpiryAlerts = $derived(data.monitor.type === "http" && data.monitor.sslCheckEnabled);

	function alertEvents(link: (typeof data.alerts)[number]): string {
		return (
			[
				link.notifyOnDown && m.status_down(),
				link.notifyOnUp && m.monitor_notify_up(),
				link.notifyOnDegraded && m.status_degraded(),
				sslExpiryAlerts && link.notifyOnSslExpiry && m.monitor_notify_ssl(),
			]
				.filter(Boolean)
				.join(" · ") || m.monitor_alerts_no_events()
		);
	}

	const nobodyHearsDown = $derived(
		!data.alerts.some((alert) => alert.enabled && alert.notifyOnDown),
	);

	const statusInfo = $derived(
		getStatusBadgeWithIcon(
			data.monitor.deadLetteredAt ? "unchecked" : (data.status?.status ?? null),
			data.monitor.active,
		),
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
			return { variant: "secondary" as const, label: m.monitor_ssl_unknown(), icon: ShieldX };
		}
		if (daysUntil <= 0) {
			return { variant: "destructive" as const, label: m.monitor_ssl_expired(), icon: ShieldX };
		}
		if (daysUntil <= (threshold ?? 14)) {
			return {
				variant: "outline" as const,
				label: m.monitor_ssl_expiring_soon(),
				icon: ShieldAlert,
			};
		}
		return { variant: "default" as const, label: m.monitor_ssl_valid(), icon: ShieldCheck };
	}

	// SSL info comes from the most recent check
	const latestSslInfo = $derived(data.recentChecks[0] ?? null);
	const sslDaysUntilExpiry = $derived(getDaysUntilExpiry(latestSslInfo?.sslExpiresAt ?? null));
	const sslStatus = $derived(
		getSslStatus(sslDaysUntilExpiry, data.monitor.sslExpiryThresholdDays ?? null),
	);
	const SslIcon = $derived(sslStatus.icon);

	const stats = $derived([
		{ label: m.monitor_uptime_24h(), value: formatUptime(data.status?.uptimePercent24h ?? null) },
		{
			label: m.monitor_avg_response(),
			value: formatResponseTime(data.status?.avgResponseTimeMs24h ?? null),
		},
		{
			label: m.monitor_last_check(),
			value: data.status?.lastCheckAt
				? new Date(data.status.lastCheckAt).toLocaleTimeString()
				: "-",
		},
		{ label: m.monitor_check_interval(), value: formatInterval(data.monitor.intervalSeconds) },
	]);
</script>

{#snippet field(label: string, value: string | number, valueClass = "")}
	<div>
		<dt class="text-muted-foreground text-sm font-medium">{label}</dt>
		<dd class="mt-1 text-sm {valueClass}">{value}</dd>
	</div>
{/snippet}

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
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={handleToggle}
					disabled={toggling}
				>
					{#if toggling}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{:else if data.monitor.active}
						<Pause class="mr-2 h-4 w-4" />
					{:else}
						<Play class="mr-2 h-4 w-4" />
					{/if}
					{data.monitor.active ? m.monitors_pause() : m.monitors_resume()}
				</Button>

				<Button variant="outline" size="sm" href="/monitors/{data.monitor.id}/edit"
					><Settings class="mr-2 h-4 w-4" />{m.common_edit()}</Button
				>

				<Button variant="destructive" size="sm" onclick={() => (showDeleteDialog = true)}
					><Trash2 class="mr-2 h-4 w-4" />{m.common_delete()}</Button
				>
			</div>
		{/snippet}
	</PageHeader>

	{#if data.monitor.deadLetteredAt && data.monitor.active}
		<Alert.Root>
			<EyeOff class="h-4 w-4" />
			<Alert.Title>{m.monitor_unchecked_title()}</Alert.Title>
			<Alert.Description>
				{uncheckedSummary(data.monitor.nextCheckAt)}
				{m.monitor_unchecked_since({ since: formatDateTimeShort(data.monitor.deadLetteredAt) })}
			</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Stats Cards -->
	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		{#each stats as stat (stat.label)}
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-muted-foreground text-sm font-medium">{stat.label}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">{stat.value}</div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<!-- Monitor Details -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.monitor_configuration()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<dl class="grid gap-4 sm:grid-cols-2">
				{@render field(m.common_type(), data.monitor.type, "uppercase")}

				{#if data.monitor.type === "http" && data.monitor.url}
					<div>
						<dt class="text-muted-foreground text-sm font-medium">{m.monitor_url()}</dt>
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
					{@render field(m.monitor_http_method(), data.monitor.method ?? "-")}
				{/if}

				{#if data.monitor.type === "tcp"}
					{@render field(
						m.monitor_hostname(),
						`${data.monitor.hostname}:${data.monitor.port}`,
						"font-mono",
					)}
				{/if}

				{#if data.monitor.type === "push" && pushUrl}
					<div class="sm:col-span-2">
						<dt class="text-muted-foreground text-sm font-medium">{m.monitor_push_url()}</dt>
						<dd class="mt-1">
							<div class="flex items-center gap-2">
								<code class="bg-muted flex-1 rounded px-3 py-2 text-sm break-all">
									{pushUrl}
								</code>
								<Button variant="outline" size="sm" onclick={() => copyToClipboard(pushUrl)}>
									{#if copied}
										<Check class="text-status-up h-4 w-4" />
									{:else}
										<Copy class="h-4 w-4" />
									{/if}
								</Button>
							</div>
							<p class="text-muted-foreground mt-2 text-xs">
								{m.monitor_push_url_desc({
									seconds:
										data.monitor.intervalSeconds + (data.monitor.pushGracePeriodSeconds || 60),
								})}
							</p>
						</dd>
					</div>
					{@render field(m.monitor_grace_period(), `${data.monitor.pushGracePeriodSeconds || 60}s`)}
				{/if}

				{@render field(m.monitor_timeout(), `${data.monitor.timeoutSeconds}s`)}
				{@render field(m.monitor_retries(), data.monitor.retries)}
				{@render field(m.monitor_alert_after(), data.monitor.alertAfterFailures)}
			</dl>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.monitor_alerts_title()}</Card.Title>
			<Card.Description>{m.monitor_alerts_desc()}</Card.Description>
			<Card.Action>
				<Button variant="ghost" size="sm" href="/monitors/{data.monitor.id}/edit#notifications">
					{m.monitor_alerts_choose()}
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			{#if data.alerts.length === 0}
				<p class="text-muted-foreground flex items-start gap-2 text-sm">
					<BellOff class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					{m.monitor_alerts_none()}
				</p>
			{:else}
				<ul class="divide-y rounded-lg border">
					{#each data.alerts as alert (alert.channelId)}
						{@const type = getChannelType(alert.type)}
						<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
							<a
								href="/notifications/{alert.channelId}"
								class="flex min-w-0 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
							>
								<type.icon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
								<span class="truncate">{alert.name}</span>
								<span class="sr-only">({type.label()})</span>
							</a>
							{#if !alert.enabled}
								<Badge variant="secondary">{m.common_disabled()}</Badge>
							{/if}
							<span class="text-muted-foreground w-full text-xs sm:ml-auto sm:w-auto">
								{alertEvents(alert)}
							</span>
						</li>
					{/each}
				</ul>
				{#if nobodyHearsDown}
					<p class="text-muted-foreground mt-3 flex items-start gap-2 text-sm">
						<BellOff class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						{m.monitor_notifications_none_attached()}
					</p>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- SSL Certificate -->
	{#if data.monitor.type === "http" && data.monitor.sslCheckEnabled}
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
					{@render field(
						m.monitor_ssl_expires(),
						latestSslInfo?.sslExpiresAt
							? new Date(latestSslInfo.sslExpiresAt).toLocaleDateString(undefined, {
									year: "numeric",
									month: "long",
									day: "numeric",
								})
							: "-",
					)}

					<div>
						<dt class="text-muted-foreground text-sm font-medium">{m.monitor_ssl_days_until()}</dt>
						<dd class="mt-1 text-sm">
							{#if sslDaysUntilExpiry !== null}
								<span
									class={sslDaysUntilExpiry <= 0
										? "text-status-down font-medium"
										: sslDaysUntilExpiry <= (data.monitor.sslExpiryThresholdDays ?? 14)
											? "text-status-degraded font-medium"
											: ""}
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

					{@render field(m.monitor_ssl_issuer(), latestSslInfo?.sslIssuer || "-")}
					{@render field(
						m.monitor_ssl_threshold(),
						m.monitor_ssl_days({ days: data.monitor.sslExpiryThresholdDays ?? 14 }),
					)}
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
				<p class="text-muted-foreground py-8 text-center">{m.monitor_no_checks()}</p>
			{:else}
				<!-- Mobile card view -->
				<div class="space-y-2 md:hidden">
					{#each data.recentChecks as check (check.id)}
						{@const iconInfo = getCheckIcon(check.status)}
						{@const CheckIcon = iconInfo.component}
						<div class="flex items-start gap-3 rounded-lg border p-3">
							<CheckIcon class="mt-0.5 h-4 w-4 shrink-0 {iconInfo.class}" />
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<span class="font-mono text-sm">{formatDate(check.checkedAt)}</span>
									<span class="font-mono text-sm">{formatResponseTime(check.responseTimeMs)}</span>
								</div>
								<div class="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
									<span>{m.monitor_table_status_code()}: {check.statusCode ?? "-"}</span>
								</div>
								{#if check.errorMessage}
									<p class="text-muted-foreground mt-1 truncate text-sm">
										{check.errorMessage}
									</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<!-- Desktop table view -->
				<Table.Root class="hidden md:table">
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-10" />
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
									{check.statusCode ?? "-"}
								</Table.Cell>
								<Table.Cell class="text-right font-mono text-sm">
									{formatResponseTime(check.responseTimeMs)}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground max-w-xs truncate text-sm">
									{check.errorMessage || "-"}
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
	itemId={data.monitor.id}
	onOpenChange={(open) => (showDeleteDialog = open)}
	onDelete={handleDelete}
	title={m.monitors_delete_title()}
	description={m.monitors_delete_desc()}
/>
