<script lang="ts">
	import { resolve } from "$app/paths";
	import logoSvg from "$lib/assets/logo.svg";
	import PricingCliffChart from "$lib/components/pricing-cliff-chart.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import * as Table from "$lib/components/ui/table";
	import { DEDICATED_PLAN, FREE_PLAN, SELF_HOSTED_LIMITS, UPPITY_PLAN } from "$lib/constants/plans";
	import { formatDateMonthDay, formatUsdCents } from "$lib/format";
	import { m } from "$lib/paraglide/messages.js";
	import { getLocale } from "$lib/paraglide/runtime";
	import type { PlanLimits } from "$lib/types/plans";
	import { getDayStatusColor } from "$lib/utils/status";

	/** `featuredUptime` is present only on the hosted instance, where
	    UPPITY_LANDING_STATUS_SLUG names a page to feature. */
	let { data } = $props();

	function dayTitle(date: string, percent: number | null): string {
		return percent === null
			? `${formatDateMonthDay(date)}: ${m.public_status_no_data()}`
			: `${formatDateMonthDay(date)}: ${percent.toFixed(1)}% uptime`;
	}

	const GITHUB_URL = "https://github.com/NeonRook/uppity";
	const STATUS_URL = "https://uppity.cloud/status/uppity";
	const CONTACT_EMAIL = "hello@neonrook.com";

	/**
	 * DESIGN.md's Measured-Value Rule decides mono per value, not per row: "50"
	 * and "30 days" are readings, "Unlimited" and "Not published" are words, and
	 * they share a column. Carrying the distinction on the value is what stops a
	 * row-level flag from setting an English sentence in Plex Mono.
	 */
	type Reading = { text: string; mono: boolean };
	const reading = (text: string): Reading => ({ text, mono: true });
	const word = (text: string): Reading => ({ text, mono: false });

	/** USD everywhere, written the way the reader's locale writes it. */
	const usd = (cents: number | null): Reading =>
		cents === null ? word("—") : reading(formatUsdCents(cents, getLocale()));

	/**
	 * The gate. Only these three capabilities have a published competitor price
	 * behind them (see PRODUCT.md); anything further would be invented, so the
	 * table stops here rather than padding itself out to look thorough.
	 */
	const unpublished = () => word(m.landing_gate_unpublished());
	const gatedCapabilities = [
		{ label: m.landing_gate_row_sso(), instatus: usd(30_000), hyperping: usd(29_900) },
		{ label: m.landing_gate_row_audit(), instatus: unpublished(), hyperping: usd(29_900) },
		{ label: m.landing_gate_row_private(), instatus: usd(30_000), hyperping: unpublished() },
	];

	const capacity = (n: number): Reading =>
		n === -1 ? word(m.landing_plan_unlimited()) : reading(n.toLocaleString(getLocale()));
	const retention = (days: number): Reading => {
		if (days === -1) return word(m.landing_plan_unlimited());
		if (days >= 365) return reading(m.landing_plan_retention_1y());
		return reading(m.landing_plan_retention_30d());
	};
	const yesNo = (v: boolean): Reading => word(v ? m.landing_plan_yes() : m.landing_plan_no());

	const plans = [
		{
			name: m.landing_plan_free(),
			price: usd(0),
			note: "",
			limits: FREE_PLAN.limits,
			channels: m.landing_plan_email_only(),
		},
		{
			name: m.landing_plan_uppity(),
			price: usd(UPPITY_PLAN.monthlyPriceCents),
			note: m.landing_plan_blocks_note(),
			limits: UPPITY_PLAN.limits,
			channels: m.landing_plan_all_channels(),
		},
		{
			name: m.landing_plan_dedicated(),
			price: usd(DEDICATED_PLAN.monthlyPriceCents),
			note: m.landing_plan_fair_use(),
			limits: DEDICATED_PLAN.limits,
			channels: m.landing_plan_all_channels(),
		},
		{
			name: m.landing_plan_selfhosted(),
			price: usd(0),
			note: "",
			limits: SELF_HOSTED_LIMITS,
			channels: m.landing_plan_all_channels(),
		},
	];

	type PlanRow = { label: string; value: (limits: PlanLimits) => Reading };

	/**
	 * One definition of the comparison, read twice: as table rows from `sm` up,
	 * and as a stacked list per plan below it. Five columns do not survive a
	 * 390px viewport, and a table that silently clips is worse than one that
	 * reflows.
	 */
	const planRows: PlanRow[] = [
		{ label: m.landing_plan_row_monitors(), value: (l) => capacity(l.monitors) },
		{
			label: m.landing_plan_row_interval(),
			value: (l) => reading(`${l.checkIntervalSeconds}s`),
		},
		{ label: m.landing_plan_row_status_pages(), value: (l) => capacity(l.statusPages) },
		{ label: m.landing_plan_row_members(), value: (l) => capacity(l.teamMembers) },
		{ label: m.landing_plan_row_retention(), value: (l) => retention(l.retentionDays) },
		{
			label: m.landing_plan_row_channels(),
			value: (l) =>
				word(
					l.notificationChannels.length > 1
						? m.landing_plan_all_channels()
						: m.landing_plan_email_only(),
				),
		},
		{ label: m.landing_plan_row_domains(), value: (l) => yesNo(l.customDomains) },
		{ label: m.landing_plan_row_sso(), value: (l) => yesNo(l.sso && l.auditLogs) },
		{ label: m.landing_plan_row_api(), value: (l) => yesNo(l.apiAccess === "full") },
	];
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

<!--
	THESIS: This page argues that the upgrade wall is the category's business model, and
	refuses the feature-grid landing page that states capabilities without pricing them.
	OWN-WORLD: DESIGN.md's Quiet Ward — zero-chroma neutrals, signal colour only, no resting
	shadows, Plex Sans with every measured value in Plex Mono. Extends the system with a
	1280px marketing column, since 896px is a prose measure and this page is chart and table.
	STORY: A visitor learns that SSO costs $299-$300 elsewhere and $12 here, sees the price
	of growth drawn rather than claimed, and leaves through one of two doors.
	FIRST VIEWPORT: Display 300 headline on one line, one muted line of offer, two buttons —
	hosted and self-hosted — side by side from sm, and the free tier named beneath them.
	FORM: "The Wall, Torn Down", candidate 5 of 7; seed key 9bff159c.
	FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
	review, the verdict, and DESIGN.md.
-->
<div class="bg-background min-h-screen">
	<header class="bg-card sticky top-0 z-50 border-b">
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
			<a
				href={resolve("/")}
				class="text-foreground flex shrink-0 items-center gap-2 text-lg font-semibold"
			>
				<img src={logoSvg} alt="" class="size-7" />
				<!-- Below sm the wordmark is not painted — German runs ~30% longer and
				     used to render underneath the buttons at 390px — but it stays in the
				     accessibility tree, so the link is never an unnamed one. -->
				<span class="sr-only sm:not-sr-only">Uppity</span>
			</a>
			<nav class="flex items-center gap-1 sm:gap-3" aria-label={m.landing_footer_product()}>
				<Button variant="ghost" href={resolve("/login")}>{m.landing_cta_sign_in()}</Button>
				<Button href={resolve("/register")}>{m.landing_cta_start_hosted()}</Button>
			</nav>
		</div>
	</header>

	<main class="mx-auto flex max-w-7xl flex-col px-4 pt-16 pb-24 sm:px-6">
		<section class="flex flex-col gap-6">
			<h1 class="text-display text-foreground text-balance">{m.landing_hero_title()}</h1>
			<p class="text-muted-foreground max-w-[60ch] text-lg text-balance">
				{m.landing_hero_subtitle()}
			</p>
			<div class="flex flex-col gap-3 sm:flex-row">
				<Button size="lg" href={resolve("/register")}>{m.landing_cta_start_hosted()}</Button>
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
		</section>

		<!-- The chart leads: the composition argues with the picture before the prose. -->
		<section class="mt-20 flex flex-col gap-6" aria-labelledby="chart-heading">
			<h2 id="chart-heading" class="text-foreground text-2xl font-semibold">
				{m.landing_chart_title()}
			</h2>
			<PricingCliffChart />
		</section>

		<section class="mt-16 flex flex-col gap-6" aria-labelledby="gate-heading">
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
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-muted-foreground text-sm">Instatus</span>
								<span class="text-muted-foreground text-sm" class:font-mono={cap.instatus.mono}>
									{cap.instatus.text}
								</span>
							</div>
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-muted-foreground text-sm">Hyperping</span>
								<span class="text-muted-foreground text-sm" class:font-mono={cap.hyperping.mono}>
									{cap.hyperping.text}
								</span>
							</div>
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-foreground text-sm">Uppity</span>
								<span class="text-status-up-ink text-sm">{m.landing_gate_included()}</span>
							</div>
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-foreground text-sm">{m.landing_gate_col_selfhosted()}</span>
								<span class="text-status-up-ink text-sm">{m.landing_gate_free()}</span>
							</div>
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
							<Table.Head scope="col" class="text-right">Uppity</Table.Head>
							<Table.Head scope="col" class="text-right"
								>{m.landing_gate_col_selfhosted()}</Table.Head
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
									{m.landing_gate_included()}
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

		<section class="mt-40 flex flex-col gap-6" aria-labelledby="plans-heading">
			<div class="flex flex-col gap-3">
				<h2 id="plans-heading" class="text-foreground text-2xl font-semibold">
					{m.landing_plans_title()}
				</h2>
				<p class="text-muted-foreground max-w-[65ch]">{m.landing_plans_caption()}</p>
			</div>

			<!-- Stacked below sm, tabular above: the same nine rows either way. -->
			<div class="flex flex-col gap-4 sm:hidden">
				{#each plans as plan (plan.name)}
					<Card.Root>
						<Card.Header>
							<Card.Title>{plan.name}</Card.Title>
							<Card.Description>
								<!-- The suffix is built in one expression rather than an inline {#if}:
								     Svelte trims the whitespace opening a block, which ate the space
								     before the separator and rendered "/month· 50 included". -->
								<span class="text-foreground font-mono text-base">{plan.price.text}</span
								>{m.landing_plan_per_month()}{plan.note ? ` · ${plan.note}` : ""}
							</Card.Description>
						</Card.Header>
						<Card.Content class="flex flex-col gap-2">
							{#each planRows as row (row.label)}
								{@const value = row.value(plan.limits)}
								<div class="flex items-baseline justify-between gap-4">
									<span class="text-muted-foreground text-sm">{row.label}</span>
									<span class="text-foreground text-sm" class:font-mono={value.mono}>
										{value.text}
									</span>
								</div>
							{/each}
						</Card.Content>
					</Card.Root>
				{/each}
			</div>

			<!-- Bare, like the ledger above it. The card wrapper this replaced inset the
			     table by its own padding, so the row labels alone sat off the left rail
			     every other block on the page reads from. -->
			<div class="hidden sm:block">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head scope="col">
								<span class="sr-only">{m.landing_gate_col_capability()}</span>
							</Table.Head>
							{#each plans as plan (plan.name)}
								<Table.Head scope="col" class="text-right align-bottom">
									<span class="text-foreground block">{plan.name}</span>
									<span class="text-foreground block font-mono text-base">
										{plan.price.text}<span class="text-muted-foreground text-xs"
											>{m.landing_plan_per_month()}</span
										>
									</span>
									{#if plan.note}
										<span class="text-muted-foreground block text-xs font-normal">{plan.note}</span>
									{/if}
								</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each planRows as row (row.label)}
							<Table.Row>
								<Table.Head scope="row" class="text-foreground font-medium">{row.label}</Table.Head>
								{#each plans as plan (plan.name)}
									{@const value = row.value(plan.limits)}
									<Table.Cell class="text-right {value.mono ? 'font-mono' : ''}">
										{value.text}
									</Table.Cell>
								{/each}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</section>

		<section class="mt-32 flex flex-col gap-4" aria-labelledby="proof-heading">
			<h2 id="proof-heading" class="text-foreground text-2xl font-semibold">
				{m.landing_proof_title()}
			</h2>
			<p class="text-muted-foreground max-w-[65ch]">{m.landing_proof_body()}</p>

			{#if data.featuredUptime}
				<!-- Real checks or nothing. Days nobody measured stay grey rather than
				     being coloured in, which is the whole reason this bar is worth
				     showing at all. -->
				<figure class="flex flex-col gap-2">
					<figcaption class="flex items-baseline justify-between gap-4">
						<span class="text-foreground text-sm">{data.featuredUptime.name}</span>
						<span class="text-muted-foreground font-mono text-sm">
							{data.featuredUptime.uptimePercent === null
								? m.public_status_no_data()
								: m.public_status_uptime({
										percent: data.featuredUptime.uptimePercent.toFixed(2),
									})}
						</span>
					</figcaption>
					<div class="flex gap-0.5" role="presentation">
						{#each data.featuredUptime.days as day (day.date)}
							<div
								class="h-8 flex-1 rounded-sm transition-[filter] duration-200 hover:brightness-125 {getDayStatusColor(
									day.status,
								)}"
								title={dayTitle(day.date, day.uptimePercent)}
							></div>
						{/each}
					</div>
					<div class="text-muted-foreground flex justify-between text-xs">
						<span>{m.public_status_days_ago()}</span>
						<span>{m.public_status_today()}</span>
					</div>
				</figure>
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
			<div class="flex flex-col gap-3 sm:flex-row">
				<Button size="lg" href={resolve("/register")}>{m.landing_cta_start_hosted()}</Button>
				<Button variant="outline" size="lg" href={GITHUB_URL} rel="noreferrer">
					{m.landing_cta_self_host()}
				</Button>
			</div>
			<p class="text-muted-foreground text-sm">
				{m.landing_hero_free_note({ count: FREE_PLAN.limits.monitors })}
			</p>
		</section>
	</main>

	<footer class="bg-card border-t">
		<div class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6">
			<div class="grid gap-8 sm:grid-cols-3">
				<div class="flex flex-col gap-3">
					<h2 class="text-foreground text-sm font-medium">{m.landing_footer_product()}</h2>
					<a class="text-muted-foreground hover:text-foreground text-sm" href={STATUS_URL}>
						{m.landing_footer_status()}
					</a>
					<a class="text-muted-foreground hover:text-foreground text-sm" href="#plans-heading">
						{m.landing_footer_pricing()}
					</a>
				</div>
				<div class="flex flex-col gap-3">
					<h2 class="text-foreground text-sm font-medium">{m.landing_footer_selfhost()}</h2>
					<a class="text-muted-foreground hover:text-foreground text-sm" href={GITHUB_URL}>
						{m.landing_footer_github()}
					</a>
					<a
						class="text-muted-foreground hover:text-foreground text-sm"
						href="{GITHUB_URL}#docker-compose"
					>
						{m.landing_footer_docker()}
					</a>
					<a
						class="text-muted-foreground hover:text-foreground text-sm"
						href="{GITHUB_URL}/blob/main/LICENSE"
					>
						{m.landing_footer_license()}
					</a>
				</div>
				<div class="flex flex-col gap-3">
					<h2 class="text-foreground text-sm font-medium">{m.landing_footer_company()}</h2>
					<a
						class="text-muted-foreground hover:text-foreground text-sm"
						href="{GITHUB_URL}/blob/main/SECURITY.md"
					>
						{m.landing_footer_security()}
					</a>
					<a
						class="text-muted-foreground hover:text-foreground text-sm"
						href="mailto:{CONTACT_EMAIL}"
					>
						{m.landing_footer_contact()}
					</a>
				</div>
			</div>
			<Separator />
			<p class="text-muted-foreground text-xs">{m.landing_footer_tagline()}</p>
		</div>
	</footer>
</div>
