<script lang="ts">
	import { getStatusInfo, formatIncidentDateTime } from "#lib/incidents.js";
	import { m } from "#lib/paraglide/messages.js";

	interface Props {
		updates: { id: string; status: string; message: string; createdAt: Date }[];
		/** Shows the first `limit` updates in a compact layout, with a count of the rest. */
		limit?: number;
	}

	let { updates, limit }: Props = $props();

	const shown = $derived(limit === undefined ? updates : updates.slice(0, limit));
	const compact = $derived(limit !== undefined);
</script>

<div class="relative {compact ? 'space-y-4' : 'space-y-6'}">
	{#each shown as update, i (update.id)}
		{@const info = getStatusInfo(update.status)}
		<div class="relative flex gap-4">
			{#if i < shown.length - 1}
				<div
					class="bg-border absolute h-full w-0.5 {compact ? 'top-8 left-3.75' : 'top-10 left-4'}"
				></div>
			{/if}
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {info.bg} {compact
					? ''
					: 'relative z-10'}"
			>
				<info.icon class="h-4 w-4 {info.color}" />
			</div>
			<div class="flex-1 pb-2">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center rounded-full py-0.5 text-xs font-medium {info.bg} {info.color} {compact
							? 'px-2'
							: 'px-2.5'}"
					>
						{info.label}
					</span>
					<span class="text-muted-foreground {compact ? 'text-xs' : 'font-mono text-sm'}">
						{formatIncidentDateTime(update.createdAt)}
					</span>
				</div>
				<p class="text-foreground {compact ? 'mt-1 text-sm' : 'mt-2'}">{update.message}</p>
			</div>
		</div>
	{/each}
	{#if limit !== undefined && updates.length > limit}
		<p class="text-muted-foreground pl-12 text-xs">
			{m.public_status_more_updates({ count: updates.length - limit })}
		</p>
	{/if}
</div>
