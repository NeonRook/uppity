<script lang="ts">
	import { resolve } from "$app/paths";

	import PlanTable, { usd } from "#lib/components/plan-table.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Table from "#lib/components/ui/table/index.js";
	import UptimeBar from "#lib/components/uptime-bar.svelte";
	import { GITHUB_URL, STATUS_URL } from "#lib/constants/links.js";
	import { FREE_PLAN } from "#lib/constants/plans.js";
	import { m } from "#lib/paraglide/messages.js";

	/** `featuredUptime` is present only on the hosted instance, where
	    UPPITY_LANDING_STATUS_SLUG names a page to feature. */
	let { data } = $props();

	/**
	 * The gate. Each figure is the monthly price of the first plan that includes
	 * the capability (see PRODUCT.md). Only these three capabilities have a
	 * published competitor price behind them, so the table stops here rather than
	 * padding itself out to look thorough.
	 */
	const gatedCapabilities = [
		{ label: m.landing_gate_row_sso(), instatus: usd(30_000), hyperping: usd(8_900) },
		{ label: m.landing_gate_row_audit(), instatus: usd(30_000), hyperping: usd(29_900) },
		{ label: m.landing_gate_row_private(), instatus: usd(5_000), hyperping: usd(8_900) },
	];

	const competitors = [
		{ key: "instatus", name: "Instatus" },
		{ key: "hyperping", name: "Hyperping" },
	] as const;
	const ours = [{ name: m.landing_gate_col_selfhosted(), value: m.landing_gate_free() }];
</script>

<svelte:head>
	<title>{m.landing_page_title()}</title>
	<meta name="description" content={m.landing_meta_description()} />
	<meta property="og:title" content={m.landing_page_title()} />
	<meta property="og:description" content={m.landing_meta_description()} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={m.landing_page_title()} />
	<meta name="twitter:description" content={m.landing_meta_description()} />
</svelte:head>

{#snippet ctas()}
	<div class="flex flex-col gap-3 sm:flex-row">
		<Button size="lg" href={resolve("register")}>{m.landing_cta_start_hosted()}</Button>
		<Button variant="outline" size="lg" href={GITHUB_URL} rel="noreferrer">
			{m.landing_cta_self_host()}
		</Button>
	</div>
	<!-- The free tier stays discoverable without competing for the headline:
	     signup speed is ground PRODUCT.md deliberately cedes. Naming the
	     ceiling here is what stops anyone meeting it by surprise later. -->
	<p class="text-muted-foreground text-sm">
		{m.landing_hero_free_note({ count: FREE_PLAN.limits.monitors })}
	</p>
{/snippet}

<!--
	THESIS: This page argues that the upgrade wall is the category's business model, and
	refuses the feature-grid landing page that states capabilities without pricing them.
	OWN-WORLD: DESIGN.md's Quiet Ward — zero-chroma neutrals, signal colour only, no resting
	shadows, Plex Sans with every measured value in Plex Mono. Extends the system with a
	1280px marketing column, since 896px is a prose measure and this page is chart and table.
	STORY: A visitor learns that SSO, audit logs and private status pages sit on paid tiers elsewhere, sees the price
	of growth drawn rather than claimed, and leaves through one of two doors.
	FIRST VIEWPORT: Display 300 headline on one line, one muted line of offer, two buttons —
	hosted and self-hosted — side by side from sm, and the free tier named beneath them.
	FORM: "The Wall, Torn Down", candidate 5 of 7; seed key 9bff159c.
	FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
	review, the verdict, and DESIGN.md.
-->
<main class="mx-auto flex max-w-7xl flex-col px-4 pt-16 pb-24 sm:px-6">
	<section class="flex flex-col gap-6">
		<h1 class="text-display text-foreground text-balance">{m.landing_hero_title()}</h1>
		<p class="text-muted-foreground max-w-[60ch] text-lg text-balance">
			{m.landing_hero_subtitle()}
		</p>
		{@render ctas()}
	</section>

	<section class="mt-20 flex flex-col gap-6" aria-labelledby="gate-heading">
		<div class="flex flex-col gap-3">
			<h2 id="gate-heading" class="text-foreground text-2xl font-semibold">
				{m.landing_gate_title()}
			</h2>
			<p class="text-muted-foreground max-w-[65ch]">{m.landing_gate_lede()}</p>
		</div>

		<!-- Stacked below sm: five columns cannot survive a 390px viewport, and
			     the competitor figures are the whole point, so none may be dropped. -->
		<div class="flex flex-col gap-4 sm:hidden">
			{#each gatedCapabilities as cap (cap.label)}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base">{cap.label}</Card.Title>
					</Card.Header>
					<Card.Content class="flex flex-col gap-2">
						{#each competitors as { key, name } (key)}
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-muted-foreground text-sm">{name}</span>
								<span class="text-muted-foreground text-sm" class:font-mono={cap[key].mono}>
									{cap[key].text}
								</span>
							</div>
						{/each}
						{#each ours as { name, value } (name)}
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-foreground text-sm">{name}</span>
								<span class="text-status-up-ink text-sm">{value}</span>
							</div>
						{/each}
					</Card.Content>
				</Card.Root>
			{/each}
			<p class="text-muted-foreground text-sm">{m.landing_gate_caption()}</p>
		</div>

		<div class="hidden sm:block">
			<Table.Root>
				<Table.Caption class="text-left">{m.landing_gate_caption()}</Table.Caption>
				<Table.Header>
					<Table.Row>
						<Table.Head scope="col">{m.landing_gate_col_capability()}</Table.Head>
						<Table.Head scope="col" class="text-right">Instatus</Table.Head>
						<Table.Head scope="col" class="text-right">Hyperping</Table.Head>
						<Table.Head scope="col" class="text-right">{m.landing_gate_col_selfhosted()}</Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each gatedCapabilities as cap (cap.label)}
						<Table.Row>
							<Table.Head scope="row" class="text-foreground font-medium">{cap.label}</Table.Head>
							<Table.Cell
								class="text-muted-foreground text-right {cap.instatus.mono ? 'font-mono' : ''}"
							>
								{cap.instatus.text}
							</Table.Cell>
							<Table.Cell
								class="text-muted-foreground text-right {cap.hyperping.mono ? 'font-mono' : ''}"
							>
								{cap.hyperping.text}
							</Table.Cell>
							<Table.Cell class="text-status-up-ink text-right">
								{m.landing_gate_free()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>

	<section class="mt-40 flex flex-col gap-8" aria-labelledby="principle-heading">
		<div class="bg-primary h-px w-full" role="presentation"></div>
		<h2
			id="principle-heading"
			class="text-foreground max-w-[16ch] text-4xl leading-[1.1] font-light tracking-[-0.02em] sm:text-5xl"
		>
			{m.landing_principle_title()}
		</h2>
		<p class="text-muted-foreground max-w-[55ch] text-lg leading-relaxed">
			{m.landing_principle_body()}
		</p>
	</section>

	<PlanTable class="mt-40" />

	<section class="mt-32 flex flex-col gap-4" aria-labelledby="proof-heading">
		<h2 id="proof-heading" class="text-foreground text-2xl font-semibold">
			{m.landing_proof_title()}
		</h2>
		<p class="text-muted-foreground max-w-[65ch]">{m.landing_proof_body()}</p>

		{#if data.featuredUptime}
			<!-- Real checks or nothing. Days nobody measured stay grey rather than
				     being coloured in, which is the whole reason this bar is worth
				     showing at all. -->
			<UptimeBar
				name={data.featuredUptime.name}
				percent={data.featuredUptime.uptimePercent}
				days={data.featuredUptime.days}
			/>
		{/if}

		<div>
			<Button variant="outline" href={STATUS_URL} rel="noreferrer">
				{m.landing_proof_link()}
			</Button>
		</div>
	</section>

	<!-- The one centred block on the page. Every other section reads from the
		     left rail; breaking that alignment once is what marks this as the end
		     rather than another section. -->
	<section
		class="mt-40 flex flex-col items-center gap-6 text-center"
		aria-labelledby="close-heading"
	>
		<div class="flex flex-col items-center gap-4">
			<h2
				id="close-heading"
				class="text-foreground max-w-[20ch] text-3xl leading-[1.1] font-light tracking-[-0.02em] sm:text-4xl"
			>
				{m.landing_close_title()}
			</h2>
			<p class="text-muted-foreground max-w-[55ch] text-lg">{m.landing_close_body()}</p>
		</div>
		{@render ctas()}
	</section>
</main>
