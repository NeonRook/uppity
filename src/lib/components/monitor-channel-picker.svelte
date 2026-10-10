<script lang="ts">
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import { getChannelType } from "#lib/notifications.js";
	import { m } from "#lib/paraglide/messages.js";
	import type { MonitorFormData } from "#lib/schemas/monitor.js";

	interface ChannelOption {
		id: string;
		name: string;
		type: string;
		enabled: boolean;
	}

	type Link = MonitorFormData["channels"][number];

	type EventKey = Exclude<keyof Link, "channelId">;

	interface Props {
		channels: ChannelOption[];
		/** Bound, so the parent's superform store stays the source of truth. */
		selected: Link[];
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

	function linkFor(channelId: string): Link | undefined {
		return selected.find((link) => link.channelId === channelId);
	}

	function toggleChannel(channelId: string) {
		selected = linkFor(channelId)
			? selected.filter((link) => link.channelId !== channelId)
			: [
					...selected,
					{
						channelId,
						notifyOnDown: true,
						notifyOnUp: true,
						notifyOnDegraded: false,
						notifyOnSslExpiry: true,
					},
				];
	}

	function toggleEvent(channelId: string, key: EventKey) {
		const index = selected.findIndex((link) => link.channelId === channelId);
		selected = selected.with(index, { ...selected[index], [key]: !selected[index][key] });
	}
</script>

{#if channels.length === 0}
	<p class="text-muted-foreground text-sm">
		{m.monitor_notifications_empty()}
		<a href="/notifications/new" class="underline underline-offset-4">
			{m.monitor_notifications_add_channel()}
		</a>
	</p>
{:else}
	<ul class="space-y-2">
		{#each channels as channel (channel.id)}
			{@const link = linkFor(channel.id)}
			<li class="rounded-md border p-3">
				<label class="flex items-center gap-3 {disabled ? 'cursor-not-allowed' : 'cursor-pointer'}">
					<Checkbox
						checked={link !== undefined}
						onCheckedChange={() => toggleChannel(channel.id)}
						{disabled}
					/>
					<span class="flex-1 truncate text-sm font-medium">{channel.name}</span>
					<Badge variant="outline">{getChannelType(channel.type).label()}</Badge>
					{#if !channel.enabled}
						<Badge variant="secondary">{m.common_disabled()}</Badge>
					{/if}
				</label>
				{#if link}
					<div class="mt-3 flex flex-wrap gap-x-5 gap-y-2 pl-7">
						{#each events as event (event.key)}
							<label class="flex items-center gap-2 text-sm">
								<Checkbox
									checked={link[event.key]}
									onCheckedChange={() => toggleEvent(channel.id, event.key)}
									{disabled}
								/>
								{event.label}
							</label>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
