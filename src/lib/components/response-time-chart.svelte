<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.js";
	import { formatResponseTime, formatUtcDay } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";
	import type { ResponseDay } from "#lib/server/services/response-history.service.js";

	/**
	 * Daily average and p95 response time, with days that saw degraded or failed
	 * checks shaded behind the lines.
	 *
	 * Authored SVG drawn at the measured pixel width, so labels keep their size on
	 * a phone instead of scaling down with a fixed viewBox. The lines are neutral;
	 * only the day shading carries status colour. A day without checks is a gap in
	 * both lines, never a point at zero.
	 */
	interface Props {
		/** Oldest first, ending today, covering the largest window. */
		days: ResponseDay[];
		/** Day windows the reader may pick, smallest first. */
		windows: number[];
	}

	let { days, windows }: Props = $props();

	const HEIGHT = 200;
	const PAD = { top: 12, right: 8, bottom: 24, left: 52 };

	const BANDS = {
		degraded: {
			fill: "fill-status-degraded-surface",
			swatch: "bg-status-degraded-surface border-status-degraded",
			label: m.status_degraded,
		},
		partial: {
			fill: "fill-status-partial-surface",
			swatch: "bg-status-partial-surface border-status-partial",
			label: m.monitor_response_some_failed,
		},
		down: {
			fill: "fill-status-down-surface",
			swatch: "bg-status-down-surface border-status-down",
			label: m.status_down,
		},
	} as const;
	type Band = keyof typeof BANDS;
	const isBand = (status: ResponseDay["status"]): status is Band => status in BANDS;

	let picked = $state<number>();
	let width = $state(720);
	let active = $state<number | null>(null);

	const windowDays = $derived(picked ?? windows[0]);
	const visible = $derived(days.slice(-windowDays));
	const hasData = $derived(visible.some((d) => d.avgMs !== null));
	const bandsShown = $derived(
		(Object.keys(BANDS) as Band[]).filter((band) => visible.some((d) => d.status === band)),
	);

	const plotWidth = $derived(Math.max(width - PAD.left - PAD.right, 1));
	const plotHeight = HEIGHT - PAD.top - PAD.bottom;
	const dayWidth = $derived(plotWidth / visible.length);

	/** Gridlines at a round step, at most four above zero, the top one at or above the highest value. */
	const ticks = $derived.by(() => {
		const highest = Math.max(1, ...visible.map((d) => Math.max(d.p95Ms ?? 0, d.avgMs ?? 0)));
		const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(highest / 4)));
		const step = [1, 2, 5, 10].map((f) => f * magnitude).find((s) => highest / s <= 4) ?? highest;
		return Array.from({ length: Math.ceil(highest / step) + 1 }, (_, i) => i * step);
	});
	const top = $derived(ticks[ticks.length - 1]);

	const x = (i: number) => PAD.left + (i + 0.5) * dayWidth;
	const y = (ms: number) => PAD.top + plotHeight - (ms / top) * plotHeight;

	/** Runs of consecutive measured days; each run is one path, a lone day is a dot. */
	function runs(value: (d: ResponseDay) => number | null): { x: number; y: number }[][] {
		const result: { x: number; y: number }[][] = [];
		let current: { x: number; y: number }[] = [];
		visible.forEach((day, i) => {
			const ms = value(day);
			if (ms === null) {
				if (current.length) result.push(current);
				current = [];
			} else {
				current.push({ x: x(i), y: y(ms) });
			}
		});
		if (current.length) result.push(current);
		return result;
	}

	const series = $derived([
		{
			key: "p95",
			label: m.monitor_response_p95(),
			runs: runs((d) => d.p95Ms),
			stroke: "stroke-muted-foreground",
			fill: "fill-muted-foreground",
			dash: "6 4",
		},
		{
			key: "avg",
			label: m.monitor_response_avg(),
			runs: runs((d) => d.avgMs),
			stroke: "stroke-foreground",
			fill: "fill-foreground",
			dash: undefined,
		},
	]);

	const pathOf = (points: { x: number; y: number }[]) =>
		points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join("");

	const activeDay = $derived(active === null ? null : visible[active]);

	function dayText(day: ResponseDay): string {
		if (day.avgMs === null) return `${formatUtcDay(day.date)}: ${m.public_status_no_data()}`;
		const band = isBand(day.status) ? `, ${BANDS[day.status].label()}` : "";
		return `${formatUtcDay(day.date)}: ${m.monitor_response_avg()} ${formatResponseTime(day.avgMs)}, ${m.monitor_response_p95()} ${formatResponseTime(day.p95Ms)}${band}`;
	}

	function pointAt(event: PointerEvent) {
		const svg = event.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const px = ((event.clientX - rect.left) / rect.width) * width;
		active = Math.min(visible.length - 1, Math.max(0, Math.floor((px - PAD.left) / dayWidth)));
	}

	function moveActive(event: KeyboardEvent) {
		const last = visible.length - 1;
		const moves: Record<string, number> = {
			ArrowLeft: Math.max(0, (active ?? last) - 1),
			ArrowRight: Math.min(last, (active ?? last) + 1),
			Home: 0,
			End: last,
		};
		if (event.key in moves) {
			event.preventDefault();
			active = moves[event.key];
		}
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<ul class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
			{#each series as s (s.key)}
				<li class="flex items-center gap-1.5">
					<svg width="16" height="2" aria-hidden="true" class="overflow-visible">
						<line
							x1="0"
							y1="1"
							x2="16"
							y2="1"
							class="{s.stroke} stroke-2"
							stroke-dasharray={s.dash}
						/>
					</svg>
					{s.label}
				</li>
			{/each}
			{#each bandsShown as band (band)}
				<li class="flex items-center gap-1.5">
					<span class="size-3 rounded-sm border {BANDS[band].swatch}" aria-hidden="true"></span>
					{BANDS[band].label()}
				</li>
			{/each}
		</ul>
		{#if windows.length > 1}
			<div role="group" aria-label={m.monitor_response_window_label()} class="flex gap-1">
				{#each windows as w (w)}
					<Button
						size="sm"
						variant={w === windowDays ? "secondary" : "ghost"}
						aria-pressed={w === windowDays}
						onclick={() => {
							picked = w;
							active = null;
						}}
					>
						{m.monitor_response_window({ days: w })}
					</Button>
				{/each}
			</div>
		{/if}
	</div>

	{#if !hasData}
		<p class="text-muted-foreground py-8 text-center text-sm">{m.monitor_response_no_data()}</p>
	{:else}
		<div class="relative" bind:clientWidth={width}>
			<svg
				{width}
				height={HEIGHT}
				viewBox="0 0 {width} {HEIGHT}"
				class="focus-visible:ring-ring/50 block w-full touch-pan-y rounded-md outline-none focus-visible:ring-[3px]"
				role="slider"
				aria-label={m.monitor_response_title()}
				aria-valuemin={0}
				aria-valuemax={visible.length - 1}
				aria-valuenow={active ?? visible.length - 1}
				aria-valuetext={dayText(activeDay ?? visible[visible.length - 1])}
				tabindex="0"
				onpointermove={pointAt}
				onpointerdown={pointAt}
				onpointerleave={() => (active = null)}
				onkeydown={moveActive}
				onfocus={() => (active ??= visible.length - 1)}
				onblur={() => (active = null)}
			>
				{#each visible as day, i (day.date)}
					{#if isBand(day.status)}
						<rect
							x={PAD.left + i * dayWidth}
							y={PAD.top}
							width={dayWidth}
							height={plotHeight}
							class={BANDS[day.status].fill}
						/>
					{/if}
				{/each}

				{#each ticks as tick (tick)}
					<line
						x1={PAD.left}
						x2={PAD.left + plotWidth}
						y1={y(tick)}
						y2={y(tick)}
						class="stroke-border"
						stroke-width="1"
					/>
					<text
						x={PAD.left - 8}
						y={y(tick)}
						dy="0.32em"
						text-anchor="end"
						class="fill-muted-foreground font-mono text-[11px]"
					>
						{formatResponseTime(tick)}
					</text>
				{/each}

				{#each series as s (s.key)}
					{#each s.runs as run, r (r)}
						{#if run.length === 1}
							<circle cx={run[0].x} cy={run[0].y} r="3" class={s.fill} />
						{:else}
							<path
								d={pathOf(run)}
								fill="none"
								class="{s.stroke} stroke-2"
								stroke-dasharray={s.dash}
								stroke-linejoin="round"
								stroke-linecap="round"
							/>
						{/if}
					{/each}
				{/each}

				{#if activeDay && active !== null}
					<line
						x1={x(active)}
						x2={x(active)}
						y1={PAD.top}
						y2={PAD.top + plotHeight}
						class="stroke-foreground/40"
						stroke-width="1"
					/>
				{/if}

				<text x={PAD.left} y={HEIGHT - 6} class="fill-muted-foreground text-xs"
					>{formatUtcDay(visible[0].date)}</text
				>
				<text
					x={PAD.left + plotWidth}
					y={HEIGHT - 6}
					text-anchor="end"
					class="fill-muted-foreground text-xs"
				>
					{m.public_status_today()}
				</text>
			</svg>

			{#if activeDay && active !== null}
				{@const left = x(active)}
				<div
					class="bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 min-w-36 rounded-md border px-3 py-2 text-xs"
					style:left="{left}px"
					style:translate={left < width / 2 ? "12px 0" : "calc(-100% - 12px) 0"}
				>
					<div class="text-muted-foreground mb-1">{formatUtcDay(activeDay.date)}</div>
					{#if activeDay.avgMs === null}
						<div>{m.public_status_no_data()}</div>
					{:else}
						{#each series as s (s.key)}
							<div class="flex items-center justify-between gap-4">
								<span class="text-muted-foreground">{s.label}</span>
								<span class="font-mono font-medium">
									{formatResponseTime(s.key === "p95" ? activeDay.p95Ms : activeDay.avgMs)}
								</span>
							</div>
						{/each}
						{#if isBand(activeDay.status)}
							<div class="mt-1">{BANDS[activeDay.status].label()}</div>
						{/if}
					{/if}
				</div>
			{/if}
		</div>

		<table class="sr-only">
			<caption>{m.monitor_response_title()}</caption>
			<thead>
				<tr>
					<th scope="col">{m.monitor_table_time()}</th>
					<th scope="col">{m.monitor_response_avg()}</th>
					<th scope="col">{m.monitor_response_p95()}</th>
					<th scope="col">{m.common_status()}</th>
				</tr>
			</thead>
			<tbody>
				{#each visible as day (day.date)}
					<tr>
						<th scope="row">{formatUtcDay(day.date)}</th>
						<td>{formatResponseTime(day.avgMs)}</td>
						<td>{formatResponseTime(day.p95Ms)}</td>
						<td>{isBand(day.status) ? BANDS[day.status].label() : ""}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
