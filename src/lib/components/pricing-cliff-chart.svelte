<script lang="ts">
	import { MONITOR_BLOCK_PRICE_CENTS, MONITOR_BLOCK_SIZE, UPPITY_PLAN } from '$lib/constants/plans';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * Price against capacity, drawn rather than asserted.
	 *
	 * Authored SVG rather than a charting library on purpose: the figures are
	 * static and this page is the product's SEO surface, so it ships as
	 * server-rendered markup with no client JS. Every colour resolves through a
	 * token, so light and dark both work without a second code path.
	 *
	 * Two geometries rather than one scaled plot: a 720-unit viewBox squeezed
	 * into 350px renders its labels at roughly 5px, so the narrow viewport gets
	 * a plot built for it instead of an unreadable copy.
	 */

	const BASE_MONITORS = UPPITY_PLAN.limits.monitors;
	const BASE_PRICE = (UPPITY_PLAN.monthlyPriceCents ?? 0) / 100;
	const BLOCK_PRICE = MONITOR_BLOCK_PRICE_CENTS / 100;

	/**
	 * Published monthly list prices, nothing interpolated (PRODUCT.md). These
	 * are tier ceilings rather than per-capacity curves — which is why they are
	 * drawn dashed. What lands you on them is a capability (SSO, audit logs,
	 * private pages), never a monitor count.
	 */
	const COMPETITORS = [
		{ label: 'Instatus', price: 300 },
		{ label: 'Hyperping', price: 299 }
	];

	const MAX_MONITORS = 1000;
	const MAX_PRICE = 320;

	type Geometry = { w: number; h: number; l: number; r: number; t: number; b: number };

	/** Wide keeps a right-hand series gutter; compact sets its labels inline. */
	const WIDE: Geometry = { w: 720, h: 360, l: 52, r: 596, t: 20, b: 320 };
	const COMPACT: Geometry = { w: 340, h: 300, l: 40, r: 332, t: 48, b: 250 };

	const scaleX = (g: Geometry, monitors: number) => g.l + (monitors / MAX_MONITORS) * (g.r - g.l);
	const scaleY = (g: Geometry, price: number) => g.b - (price / MAX_PRICE) * (g.b - g.t);

	/** Uppity's real ladder: the base allowance, then one step per block. */
	const steps = $derived.by(() => {
		const out: { monitors: number; price: number }[] = [];
		for (let k = 0; ; k++) {
			const monitors = BASE_MONITORS + k * MONITOR_BLOCK_SIZE;
			if (monitors > MAX_MONITORS) break;
			out.push({ monitors, price: BASE_PRICE + k * BLOCK_PRICE });
		}
		return out;
	});

	const topStep = $derived(steps[steps.length - 1]);

	/** Step-after: hold the price across the block, then rise. */
	const path = (g: Geometry) => {
		let d = `M ${scaleX(g, 0)} ${scaleY(g, BASE_PRICE)}`;
		for (const [i, s] of steps.entries()) {
			d += ` H ${scaleX(g, s.monitors)}`;
			const next = steps[i + 1];
			if (next) d += ` V ${scaleY(g, next.price)}`;
		}
		return d;
	};

	const CALLOUTS = new Set([100, 500]);
	const callouts = $derived(steps.filter((s) => CALLOUTS.has(s.monitors)));

	const priceTicks = [0, 100, 200, 300];
	const wideMonitorTicks = [200, 400, 600, 800, 1000];
	const compactMonitorTicks = [500, 1000];
</script>

{#snippet plot(g: Geometry, monitorTicks: number[], compact: boolean)}
	<svg
		viewBox="0 0 {g.w} {g.h}"
		class={compact ? 'w-full sm:hidden' : 'hidden w-full sm:block'}
		role="img"
		aria-labelledby={compact ? 'cliff-title-c cliff-desc-c' : 'cliff-title cliff-desc'}
		preserveAspectRatio="xMidYMid meet"
	>
		<title id={compact ? 'cliff-title-c' : 'cliff-title'}>{m.landing_chart_title()}</title>
		<desc id={compact ? 'cliff-desc-c' : 'cliff-desc'}>{m.landing_chart_desc()}</desc>

		{#each priceTicks as p (p)}
			<line
				x1={g.l}
				y1={scaleY(g, p)}
				x2={g.r}
				y2={scaleY(g, p)}
				class="stroke-border"
				stroke-width="1"
			/>
			<text
				x={g.l - 8}
				y={scaleY(g, p) + 4}
				text-anchor="end"
				class="fill-muted-foreground font-mono text-xs">${p}</text
			>
		{/each}

		{#each monitorTicks as mt (mt)}
			<text
				x={scaleX(g, mt)}
				y={g.b + 20}
				text-anchor="middle"
				class="fill-muted-foreground font-mono text-xs">{mt}</text
			>
		{/each}
		<text x={g.r} y={g.b + 38} text-anchor="end" class="fill-muted-foreground text-xs"
			>{m.landing_chart_axis_monitors()}</text
		>
		<text x="0" y={g.t - 10} text-anchor="start" class="fill-muted-foreground text-xs"
			>{m.landing_chart_axis_price()}</text
		>

		<!-- Competitor tiers, dashed: these are ceilings a capability pushes you
		     onto, not prices that scale with capacity. A solid line would assert
		     a curve neither vendor publishes. -->
		{#each COMPETITORS as c (c.label)}
			<line
				x1={g.l}
				y1={scaleY(g, c.price)}
				x2={g.r}
				y2={scaleY(g, c.price)}
				class="stroke-status-unknown"
				stroke-width="1.5"
				stroke-dasharray="6 4"
			/>
		{/each}

		<!-- The gate marker, tied to the line it names instead of floating near it. -->
		<line
			x1={g.l}
			y1={scaleY(g, COMPETITORS[1].price)}
			x2={g.l}
			y2={scaleY(g, COMPETITORS[1].price) - 14}
			class="stroke-status-down"
			stroke-width="1.5"
		/>
		<text x={g.l + 6} y={scaleY(g, COMPETITORS[1].price) - 18} class="fill-status-down text-xs"
			>{m.landing_gate_row_sso()} · {m.landing_gate_row_audit()}</text
		>

		{#if compact}
			<!-- Below the line: above it the gate marker already owns that band. -->
			<text
				x={g.r}
				y={scaleY(g, COMPETITORS[1].price) + 16}
				text-anchor="end"
				class="fill-muted-foreground font-mono text-xs"
				>{COMPETITORS[0].label} ${COMPETITORS[0].price} · {COMPETITORS[1].label} ${COMPETITORS[1]
					.price}</text
			>
		{:else}
			<text
				x={g.r + 8}
				y={scaleY(g, COMPETITORS[0].price) - 4}
				class="fill-muted-foreground font-mono text-xs"
				>{COMPETITORS[0].label} ${COMPETITORS[0].price}</text
			>
			<text
				x={g.r + 8}
				y={scaleY(g, COMPETITORS[1].price) + 12}
				class="fill-muted-foreground font-mono text-xs"
				>{COMPETITORS[1].label} ${COMPETITORS[1].price}</text
			>
		{/if}

		<path d={path(g)} class="stroke-primary" stroke-width="2" fill="none" />
		{#each callouts as c (c.monitors)}
			<circle cx={scaleX(g, c.monitors)} cy={scaleY(g, c.price)} r="3" class="fill-primary" />
			<text
				x={scaleX(g, c.monitors)}
				y={scaleY(g, c.price) - 10}
				text-anchor="middle"
				class="fill-foreground font-mono text-xs">${c.price}</text
			>
		{/each}

		{#if compact}
			<text
				x={g.r}
				y={scaleY(g, topStep.price) - 10}
				text-anchor="end"
				class="fill-primary font-mono text-xs">Uppity ${topStep.price}</text
			>
		{:else}
			<text x={g.r + 8} y={scaleY(g, topStep.price) + 4} class="fill-primary font-mono text-xs"
				>Uppity ${topStep.price}</text
			>
		{/if}
	</svg>
{/snippet}

<figure class="flex flex-col gap-3">
	{@render plot(COMPACT, compactMonitorTicks, true)}
	{@render plot(WIDE, wideMonitorTicks, false)}
	<figcaption class="max-w-[65ch] text-sm text-muted-foreground">
		{m.landing_chart_caption()}
	</figcaption>
</figure>
