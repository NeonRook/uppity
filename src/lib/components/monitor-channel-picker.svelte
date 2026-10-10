<script lang="ts">
	import { BellOff, BellPlus, Check } from "@lucide/svelte";

	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import { getChannelType, type ChannelOption } from "#lib/notifications.js";
	import { m } from "#lib/paraglide/messages.js";
	import { defaultChannelLink, type MonitorChannelLink } from "#lib/schemas/monitor.js";

	type EventKey = Exclude<keyof MonitorChannelLink, "channelId">;

	interface Props {
		channels: ChannelOption[];
		/** Bound, so the parent's superform store stays the source of truth. */
		selected: MonitorChannelLink[];
		/** Certificate expiry only applies to HTTP monitors with the SSL check on. */
		showSslExpiry: boolean;
		disabled?: boolean;
	}

	let { channels, selected = $bindable(), showSslExpiry, disabled = false }: Props = $props();

	const events = $derived<{ key: EventKey; label: string }[]>([
		{ key: "notifyOnDown", label: m.status_down() },
		{ key: "notifyOnUp", label: m.monitor_notify_up() },
		{ key: "notifyOnDegraded", label: m.status_degraded() },
		...(showSslExpiry
			? [{ key: "notifyOnSslExpiry" as const, label: m.monitor_notify_ssl() }]
			: []),
	]);

	const nobodyHearsDown = $derived(
		!selected.some(
			(link) =>
				link.notifyOnDown && channels.find((c) => c.id === link.channelId)?.enabled === true,
		),
	);

	function linkFor(channelId: string): MonitorChannelLink | undefined {
		return selected.find((link) => link.channelId === channelId);
	}

	function toggleChannel(channelId: string) {
		selected = linkFor(channelId)
			? selected.filter((link) => link.channelId !== channelId)
			: [...selected, defaultChannelLink(channelId)];
	}

	function toggleEvent(channelId: string, key: EventKey) {
		const index = selected.findIndex((link) => link.channelId === channelId);
		selected = selected.with(index, { ...selected[index], [key]: !selected[index][key] });
	}
</script>

{#if channels.length === 0}
	<div class="flex flex-col items-center py-6 text-center">
		<BellPlus class="text-muted-foreground/50 mb-4 size-12" aria-hidden="true" />
		<p class="text-sm font-semibold">{m.monitor_notifications_empty()}</p>
		<p class="text-muted-foreground mt-1 max-w-sm text-sm">
			{m.monitor_notifications_empty_desc()}
		</p>
		<Button variant="outline" size="sm" class="mt-4" href="/notifications/new">
			{m.monitor_notifications_add_channel()}
		</Button>
	</div>
{:else}
	<ul class="divide-y rounded-lg border">
		{#each channels as channel (channel.id)}
			{@const link = linkFor(channel.id)}
			{@const type = getChannelType(channel.type)}
			<li class="px-4 py-3">
				<label class="flex items-start gap-3 {disabled ? 'cursor-not-allowed' : 'cursor-pointer'}">
					<Checkbox
						class="mt-0.5"
						checked={link !== undefined}
						onCheckedChange={() => toggleChannel(channel.id)}
						{disabled}
					/>
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-2">
							<type.icon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
							<span class="truncate text-sm font-medium">{channel.name}</span>
							<span class="sr-only">({type.label()})</span>
							{#if !channel.enabled}
								<Badge variant="secondary">{m.common_disabled()}</Badge>
							{/if}
						</span>
						{#if channel.destination && channel.destination !== channel.name}
							<span class="text-muted-foreground mt-0.5 block truncate font-mono text-xs">
								{channel.destination}
							</span>
						{/if}
					</span>
				</label>

				{#if link}
					<div
						role="group"
						aria-label={m.monitor_notifications_events()}
						class="mt-3 flex flex-wrap items-center gap-2 pl-7"
					>
						<span class="text-muted-foreground mr-1 w-full text-xs sm:w-auto" aria-hidden="true">
							{m.monitor_notifications_events()}
						</span>
						{#each events as event (event.key)}
							{@const on = link[event.key]}
							<button
								type="button"
								aria-pressed={on}
								{disabled}
								onclick={() => toggleEvent(channel.id, event.key)}
								class="focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 sm:h-7 {on
									? 'bg-secondary text-foreground border-border'
									: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-dashed'}"
							>
								{#if on}<Check class="size-3" aria-hidden="true" />{/if}
								{event.label}
							</button>
						{/each}
					</div>
					{#if !channel.enabled}
						<p class="text-muted-foreground mt-2 pl-7 text-xs">
							{m.monitor_notifications_disabled_hint()}
						</p>
					{/if}
				{/if}
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
