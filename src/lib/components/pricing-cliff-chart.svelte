<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { MONITOR_BLOCK_PRICE_CENTS, MONITOR_BLOCK_SIZE, UPPITY_PLAN } from '$lib/constants/plans';

	const BASE_MONITORS = UPPITY_PLAN.limits.monitors;
	const BASE_PRICE = (UPPITY_PLAN.monthlyPriceCents ?? 0) / 100;
	const BLOCK_PRICE = MONITOR_BLOCK_PRICE_CENTS / 100;

	/**
	 * Price-against-capacity, drawn rather than asserted.
	 *
	 * Authored SVG instead of a charting library on purpose: the six figures are
	 * static and the page is the product's SEO surface, so this ships as server
	 * -rendered markup with no client JS. Every colour resolves through a token,
	 * so light and dark both work without a second code path.
	 */

	// Competitor figures are published monthly list prices. Nothing here is
	// interpolated — see PRODUCT.md; only these two are confirmed.
	const COMPETITORS = [
		{ label: 'Instatus', price: 300 },
		{ label: 'Hyperping', price: 299 }
	];

	const MAX_MONITORS = 1000;
	const MAX_PRICE = 320;

	// viewBox geometry. Left gutter holds the price axis, right gutter the
	// series labels, bottom the capacity axis.
	const W = 720;
	const H = 360;
	const L = 52;
	const R = 596;
	const T = 20;
	const B = 320;

	const x = (monitors: number) => L + (monitors / MAX_MONITORS) * (R - L);
	const y = (price: number) => B - (price / MAX_PRICE) * (B - T);

	/** Uppity's real ladder: base, then one step per capacity block. */
	const steps = $derived.by(() => {
		const out: { monitors: number; price: number }[] = [];
		for (let k = 0; ; k++) {
			const monitors = BASE_MONITORS + k * MONITOR_BLOCK_SIZE;
			if (monitors > MAX_MONITORS) break;
			out.push({ monitors, price: BASE_PRICE + k * BLOCK_PRICE });
		}
		return out;
	});

	/** Step-after path: hold the price across the block, then rise. */
	const uppityPath = $derived.by(() => {
		let d = `M ${x(0)} ${y(BASE_PRICE)}`;
		for (const [i, s] of steps.entries()) {
			d += ` H ${x(s.monitors)}`;
			const next = steps[i + 1];
			if (next) d += ` V ${y(next.price)}`;
		}
		return d;
	});

	/**
	 * Only the figures PRODUCT.md publishes as worked examples get a label. The
	 * last one is left unlabelled: the series label already sits at that point,
	 * and two bits of text on one coordinate collide.
	 */
	const CALLOUTS = new Set([100, 500]);
	const callouts = $derived(steps.filter((s) => CALLOUTS.has(s.monitors)));

	/** Same figures as the plot, for viewports too narrow to read a chart. */
	const WORKED_EXAMPLES = new Set([100, 500, 1000]);
	const workedExamples = $derived(steps.filter((s) => WORKED_EXAMPLES.has(s.monitors)));

	const priceTicks = [0, 100, 200, 300];
	const monitorTicks = [200, 400, 600, 800, 1000];
</script>

<figure class="flex flex-col gap-3">
	<!-- Below sm the plot is replaced, not shrunk: a 720-unit viewBox at 350px
	     renders its labels at about 5px, which is a chart nobody can read. -->
	<dl class="flex flex-col gap-2 sm:hidden">
		{#each workedExamples as ex (ex.monitors)}
			<div class="flex items-baseline justify-between gap-4 border-b py-2">
				<dt class="font-mono text-sm text-muted-foreground">
					{ex.monitors.toLocaleString()}
					{m.landing_chart_axis_monitors()}
				</dt>
				<dd class="font-mono text-sm text-foreground">${ex.price}</dd>
			</div>
		{/each}
		{#each COMPETITORS as c (c.label)}
			<div class="flex items-baseline justify-between gap-4 border-b py-2">
				<dt class="text-sm text-muted-foreground">{c.label}</dt>
				<dd class="font-mono text-sm text-muted-foreground">${c.price}</dd>
			</div>
		{/each}
	</dl>

	<svg
		viewBox="0 0 {W} {H}"
		class="hidden w-full sm:block"
		role="img"
		aria-labelledby="cliff-title cliff-desc"
		preserveAspectRatio="xMidYMid meet"
	>
		<title id="cliff-title">{m.landing_chart_title()}</title>
		<desc id="cliff-desc">{m.landing_chart_desc()}</desc>

		<!-- Price axis -->
		{#each priceTicks as p (p)}
			<line x1={L} y1={y(p)} x2={R} y2={y(p)} class="stroke-border" stroke-width="1" />
			<text
				x={L - 10}
				y={y(p) + 4}
				text-anchor="end"
				class="fill-muted-foreground font-mono text-xs">${p}</text
			>
		{/each}

		<!-- Capacity axis -->
		{#each monitorTicks as mt (mt)}
			<text
				x={x(mt)}
				y={B + 20}
				text-anchor="middle"
				class="fill-muted-foreground font-mono text-xs">{mt}</text
			>
		{/each}
		<text x={R} y={B + 38} text-anchor="end" class="fill-muted-foreground text-xs"
			>{m.landing_chart_axis_monitors()}</text
		>
		<!-- Anchored start at the gutter's left edge: anchoring end at L-10 pushed
		     the label off the viewBox and clipped it. -->
		<text x="0" y={T - 6} text-anchor="start" class="fill-muted-foreground text-xs"
			>{m.landing_chart_axis_price()}</text
		>

		<!-- The gate. Both competitors sit within a dollar of each other, so they
		     read as one line — which is the finding, not a rendering compromise. -->
		{#each COMPETITORS as c (c.label)}
			<line
				x1={L}
				y1={y(c.price)}
				x2={R}
				y2={y(c.price)}
				class="stroke-status-unknown"
				stroke-width="1.5"
			/>
		{/each}
		<text x={R + 8} y={y(COMPETITORS[0].price) - 4} class="fill-muted-foreground font-mono text-xs"
			>{COMPETITORS[0].label} ${COMPETITORS[0].price}</text
		>
		<text x={R + 8} y={y(COMPETITORS[1].price) + 12} class="fill-muted-foreground font-mono text-xs"
			>{COMPETITORS[1].label} ${COMPETITORS[1].price}</text
		>
		<text x={L + 4} y={y(COMPETITORS[1].price) - 10} class="fill-status-down text-xs"
			>{m.landing_gate_row_sso()} · {m.landing_gate_row_audit()}</text
		>

		<!-- Uppity's ladder -->
		<path d={uppityPath} class="stroke-primary" stroke-width="2" fill="none" />
		{#each callouts as c (c.monitors)}
			<circle cx={x(c.monitors)} cy={y(c.price)} r="3" class="fill-primary" />
			<text
				x={x(c.monitors)}
				y={y(c.price) - 10}
				text-anchor="middle"
				class="fill-foreground font-mono text-xs">${c.price}</text
			>
		{/each}
		<text x={R + 8} y={y(steps[steps.length - 1].price) + 4} class="fill-primary font-mono text-xs"
			>Uppity ${steps[steps.length - 1].price}</text
		>
	</svg>

	<figcaption class="text-sm text-muted-foreground">{m.landing_chart_caption()}</figcaption>
</figure>
