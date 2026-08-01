<script lang="ts">
	import { MONITOR_BLOCK_PRICE_CENTS, MONITOR_BLOCK_SIZE, UPPITY_PLAN } from '$lib/constants/plans';
	import { formatUsdCents } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';

	/**
	 * Price against capacity, drawn rather than asserted.
	 *
	 * Authored SVG rather than a charting library on purpose: the figures are
	 * static and this page is the product's SEO surface, so the whole chart is
	 * server-rendered markup. The only client code is the observer that starts
	 * the draw; nothing the chart *says* depends on it. Every colour resolves
	 * through a token, so light and dark both work without a second code path.
	 *
	 * Two geometries rather than one scaled plot: a 720-unit viewBox squeezed
	 * into 350px renders its labels at roughly 5px, so the narrow viewport gets
	 * a plot built for it instead of an unreadable copy.
	 */

	const BASE_MONITORS = UPPITY_PLAN.limits.monitors;
	const BASE_PRICE = (UPPITY_PLAN.monthlyPriceCents ?? 0) / 100;
	const BLOCK_PRICE = MONITOR_BLOCK_PRICE_CENTS / 100;

	/**
	 * Every figure on the plot, written the way the surrounding caption writes it.
	 *
	 * Rounded back to whole cents because the plot holds dollars — the geometry
	 * needs them — while the formatter takes cents. Every price on this chart is
	 * a whole dollar today, so the product is already exact. It stops being exact
	 * the moment a block price is not binary-representable: `12 + 10 * 8.3` lands
	 * on 95.00000000000001, and `formatUsdCents` decides between "$95" and
	 * "$95.00" on `Number.isInteger`. The rounding keeps that decision resting on
	 * the price rather than on the float.
	 */
	const usd = (dollars: number) => formatUsdCents(Math.round(dollars * 100), getLocale());

	/**
	 * Assembled here rather than interpolated across the compact `<text>`: the
	 * formatter reflows that markup onto several lines, and SVG only *renders*
	 * the resulting newlines away — they stay in the accessible name and in
	 * anything that copies the label.
	 */
	const competitorSummary = () => COMPETITORS.map((c) => `${c.label} ${usd(c.price)}`).join(' · ');

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

	/**
	 * Wide keeps a right-hand series gutter; compact sets its labels inline.
	 * Wide's height clears its baseline by enough to hold the axis caption's
	 * descent — at 360 the caption's box crossed the canvas edge.
	 *
	 * Both reserve the same 48-unit top inset. The gate annotation hangs above
	 * the $300 line, so a smaller inset leaves it sharing a baseline with the
	 * price-axis caption in the top-left corner and the two read as one run of
	 * text — in German, where the caption is wider, they touch outright.
	 *
	 * Both gutters are sized for the longest currency string any shipped locale
	 * produces, which is pt-BR's "US$ 300" — three characters wider than "$300"
	 * and the reason 52 was not enough on the left or 596 on the right. Sizing
	 * to English clips Portuguese, and the plot losing ~5% of its width costs
	 * the argument nothing.
	 */
	const WIDE: Geometry = { w: 720, h: 364, l: 64, r: 580, t: 48, b: 320 };
	const COMPACT: Geometry = { w: 340, h: 300, l: 64, r: 332, t: 48, b: 250 };

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

	/**
	 * The draw plays once, when the chart is actually on screen. On a phone it
	 * sits well below the fold, so a load-triggered animation finishes long
	 * before the reader arrives and they scroll down to a static chart.
	 *
	 * CSS cannot express this. `animation-timeline: view()` scrubs progress
	 * against scroll position rather than playing once, and treats an element
	 * already in view as finished — which would fix mobile by costing desktop
	 * the moment entirely. So: one observer, disconnected the instant it fires.
	 *
	 * It ships as inline markup rather than as an attachment because `/` sets
	 * `csr = false` and is never hydrated. This is the page's entire JavaScript
	 * budget — roughly 300 bytes, parsed from the document that carries it,
	 * against the 87 KB the framework cost to do the same thing.
	 *
	 * The consequence, if this chart is ever reused on a route that *is*
	 * hydrated: the reveal silently does nothing. Svelte's client `{@html}`
	 * deliberately never executes script tags, and `csr = false` on one route
	 * does not remove it from the client manifest, so a client-side navigation
	 * to `/` would render this markup inert too. Nothing breaks — the resting
	 * CSS below is the finished chart, so the reading is always correct and only
	 * the motion is lost — but the animation is not portable. A hydrated host
	 * needs the attachment back, not a second copy of this script.
	 *
	 * The `rootMargin` fires when the chart's top reaches the upper 60% of the
	 * viewport, not when its first pixel peeks over the bottom edge. On a
	 * 390x844 phone the chart already pokes into the fold at load, so a
	 * permissive margin reintroduces exactly the bug this is here to fix.
	 * Measured against the element's own top rather than a visible-fraction
	 * threshold, which breaks once the chart is taller than the viewport.
	 *
	 * The tag name is interpolated at both ends, and this comment spells no tag
	 * out either. Svelte closes the block at the first literal closing script
	 * tag it meets, and Prettier reads a literal opening one as a second
	 * component script — anywhere in the file, prose included. Escaping the
	 * slash satisfies both but trips the linters, which see an escape that is
	 * redundant everywhere except here.
	 */
	const TAG = 'script';
	const REVEAL_SCRIPT = `<${TAG}>
for (const el of document.querySelectorAll("[data-cliff-reveal]")) {
	const o = new IntersectionObserver((entries) => {
		if (!entries.some((e) => e.isIntersecting)) return;
		el.classList.add("cliff-drawn");
		o.disconnect();
	}, { rootMargin: "0px 0px -40% 0px" });
	o.observe(el);
}
</${TAG}>`;
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
				class="fill-muted-foreground font-mono text-xs">{usd(p)}</text
			>
		{/each}

		<!-- The compact plot's right edge *is* the viewBox edge — unlike wide,
		     which reserves a series gutter — so a centred final tick hangs 7
		     units into the void and "1000" renders as "100". An axis that
		     understates capacity tenfold is the one error this chart cannot
		     afford, so the last tick anchors to its own end. -->
		{#each monitorTicks as mt (mt)}
			<text
				x={scaleX(g, mt)}
				y={g.b + 20}
				text-anchor={compact && mt === MAX_MONITORS ? 'end' : 'middle'}
				class="fill-muted-foreground font-mono text-xs">{mt}</text
			>
		{/each}
		<text x={g.r} y={g.b + 38} text-anchor="end" class="fill-muted-foreground text-xs"
			>{m.landing_chart_axis_monitors()}</text
		>
		<!-- Pinned to the viewBox corner, not hung off `t`: an offset measured from
		     the plot area was either clipped at the canvas edge or pushed down into
		     the gate annotation's band. The corner is what this label actually wants,
		     and the 48-unit top inset is what keeps the two apart. -->
		<text x="0" y="16" text-anchor="start" class="fill-muted-foreground text-xs"
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
			<!-- Below the line: above it the gate marker already owns that band. Far
			     enough below to clear the $300 tick opposite it — in pt-BR the label
			     runs wide enough to reach across and share that band. -->
			<text
				x={g.r}
				y={scaleY(g, COMPETITORS[1].price) + 24}
				text-anchor="end"
				class="fill-muted-foreground font-mono text-xs">{competitorSummary()}</text
			>
		{:else}
			<text
				x={g.r + 8}
				y={scaleY(g, COMPETITORS[0].price) - 4}
				class="fill-muted-foreground font-mono text-xs"
				>{COMPETITORS[0].label} {usd(COMPETITORS[0].price)}</text
			>
			<text
				x={g.r + 8}
				y={scaleY(g, COMPETITORS[1].price) + 12}
				class="fill-muted-foreground font-mono text-xs"
				>{COMPETITORS[1].label} {usd(COMPETITORS[1].price)}</text
			>
		{/if}

		<!-- pathLength normalises the ladder to 1 unit, so the draw is a plain
		     dashoffset animation with nothing to measure at runtime. -->
		<path
			d={path(g)}
			pathLength="1"
			class="cliff-ladder stroke-primary"
			stroke-width="2"
			fill="none"
		/>
		{#each callouts as c (c.monitors)}
			<g class="cliff-mark">
				<circle cx={scaleX(g, c.monitors)} cy={scaleY(g, c.price)} r="3" class="fill-primary" />
				<text
					x={scaleX(g, c.monitors)}
					y={scaleY(g, c.price) - 10}
					text-anchor="middle"
					class="fill-foreground font-mono text-xs">{usd(c.price)}</text
				>
			</g>
		{/each}

		<!-- Emerald ink, not the emerald itself: Vital Emerald sits at 0.696 lightness
		     and computes to 2.37:1 as text on Ward Paper. Same relationship the
		     ledger's "Included at $12" cells use, and it still reads as this
		     series because the ink is the same hue as the line it names. -->
		{#if compact}
			<text
				x={g.r}
				y={scaleY(g, topStep.price) - 10}
				text-anchor="end"
				class="fill-status-up-ink font-mono text-xs">Uppity {usd(topStep.price)}</text
			>
		{:else}
			<text
				x={g.r + 8}
				y={scaleY(g, topStep.price) + 4}
				class="fill-status-up-ink font-mono text-xs">Uppity {usd(topStep.price)}</text
			>
		{/if}
	</svg>
{/snippet}

<figure class="flex flex-col gap-3" data-cliff-reveal>
	{@render plot(COMPACT, compactMonitorTicks, true)}
	{@render plot(WIDE, wideMonitorTicks, false)}
	<figcaption class="max-w-[65ch] text-sm text-muted-foreground">
		{m.landing_chart_caption()}
	</figcaption>
</figure>
<!-- After the figure, so the element it observes is already parsed. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -- authored constant, no interpolation -->
{@html REVEAL_SCRIPT}

<style>
	/*
	 * The page's one authored moment: the ladder draws itself, then its readings
	 * settle. An instrument reporting a measurement, which is the only thing
	 * DESIGN.md licenses motion for — it acknowledges, then stops.
	 *
	 * Plays once, on reveal. Nothing else on this page moves.
	 */
	@keyframes cliff-draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}

	@keyframes cliff-settle {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Resting state is the finished reading: dasharray 1 against pathLength 1 is
	   a single dash long enough to cover the whole path. Motion is layered on
	   top, so no JS, no IntersectionObserver, and reduced motion all land here
	   rather than on a chart stuck half-drawn. */
	.cliff-ladder {
		stroke-dasharray: 1;
		stroke-dashoffset: 0;
	}

	/* `cliff-drawn` is set from the inline observer rather than from a class
	   directive, so it never appears in this component's markup and Svelte
	   would prune these rules as unused. `:global()` on the ancestor keeps
	   them; the animated children stay scoped. */
	:global(.cliff-drawn) .cliff-ladder {
		/*
		 * Held back so the chart is seen before anything moves, and eased with a
		 * cubic rather than an expo curve: expo covers most of the path in its
		 * first fraction, which reads as a line whipping across rather than an
		 * instrument tracing a measurement.
		 */
		animation: cliff-draw 1100ms cubic-bezier(0.33, 1, 0.68, 1) 700ms backwards;
	}

	:global(.cliff-drawn) .cliff-mark {
		animation: cliff-settle 350ms ease-out 1600ms backwards;
	}

	/* Reduced motion gets the finished reading, not a slower one. */
	@media (prefers-reduced-motion: reduce) {
		:global(.cliff-drawn) .cliff-ladder,
		:global(.cliff-drawn) .cliff-mark {
			animation: none;
		}
	}
</style>
