<script lang="ts">
	import { floorPercent, formatDateMonthDay } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getDayStatusColor } from "#lib/utils/status.js";

	interface Props {
		name: string;
		/** Null when the window holds no checks, which reads as "no data" rather than 100%. */
		percent: number | null;
		days: { date: string; status: string; uptimePercent: number | null }[];
		/** Background class for a status dot beside the name. */
		dotClass?: string;
	}

	let { name, percent, days, dotClass }: Props = $props();

	function dayTitle(date: string, dayPercent: number | null): string {
		return dayPercent === null
			? `${formatDateMonthDay(date)}: ${m.public_status_no_data()}`
			: `${formatDateMonthDay(date)}: ${floorPercent(dayPercent, 1)}% uptime`;
	}
</script>

<figure>
	<figcaption class="mb-3 flex items-center justify-between gap-4">
		<div class="flex items-center gap-2">
			{#if dotClass}
				<div class="h-3 w-3 rounded-full {dotClass}"></div>
			{/if}
			<span class="text-foreground font-medium">{name}</span>
		</div>
		<span class="text-muted-foreground font-mono text-sm">
			{percent === null
				? m.public_status_no_data()
				: m.public_status_uptime({ percent: floorPercent(percent, 2) })}
		</span>
	</figcaption>
	<div class="flex gap-0.5" role="presentation">
		{#each days as day (day.date)}
			<div
				class="h-8 flex-1 rounded-sm transition-[filter] duration-200 hover:brightness-125 {getDayStatusColor(
					day.status,
				)}"
				title={dayTitle(day.date, day.uptimePercent)}
			></div>
		{/each}
	</div>
	<div class="text-muted-foreground mt-1 flex justify-between text-xs">
		<span>{m.public_status_days_ago()}</span>
		<span>{m.public_status_today()}</span>
	</div>
</figure>
