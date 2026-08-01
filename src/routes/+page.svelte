<script lang="ts">
	import { resolve } from '$app/paths';
	import logoSvg from '$lib/assets/logo.svg';
	import PricingCliffChart from '$lib/components/pricing-cliff-chart.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import * as Table from '$lib/components/ui/table';
	import { DEDICATED_PLAN, FREE_PLAN, SELF_HOSTED_LIMITS, UPPITY_PLAN } from '$lib/constants/plans';
	import { m } from '$lib/paraglide/messages.js';
	import type { PlanLimits } from '$lib/types/plans';

	const GITHUB_URL = 'https://github.com/NeonRook/uppity';
	const STATUS_URL = 'https://uppity.cloud/status/uppity';
	const CONTACT_EMAIL = 'hello@neonrook.com';

	const dollars = (cents: number | null) => (cents === null ? '—' : `$${cents / 100}`);

	/**
	 * The gate. Only these three capabilities have a published competitor price
	 * behind them (see PRODUCT.md); anything further would be invented, so the
	 * table stops here rather than padding itself out to look thorough.
	 */
	const gatedCapabilities = [
		{ label: m.landing_gate_row_sso(), instatus: '$300', hyperping: '$299' },
		{
			label: m.landing_gate_row_audit(),
			instatus: m.landing_gate_unpublished(),
			hyperping: '$299'
		},
		{
			label: m.landing_gate_row_private(),
			instatus: '$300',
			hyperping: m.landing_gate_unpublished()
		}
	];

	const capacity = (n: number) => (n === -1 ? m.landing_plan_unlimited() : n.toLocaleString());
	const retention = (days: number) => {
		if (days === -1) return m.landing_plan_unlimited();
		if (days >= 365) return m.landing_plan_retention_1y();
		return m.landing_plan_retention_30d();
	};
	const yesNo = (v: boolean) => (v ? m.landing_plan_yes() : m.landing_plan_no());

	const plans = [
		{
			name: m.landing_plan_free(),
			price: m.landing_plan_free_price(),
			note: '',
			limits: FREE_PLAN.limits,
			channels: m.landing_plan_email_only()
		},
		{
			name: m.landing_plan_uppity(),
			price: dollars(UPPITY_PLAN.monthlyPriceCents),
			note: m.landing_plan_blocks_note(),
			limits: UPPITY_PLAN.limits,
			channels: m.landing_plan_all_channels()
		},
		{
			name: m.landing_plan_dedicated(),
			price: dollars(DEDICATED_PLAN.monthlyPriceCents),
			note: m.landing_plan_fair_use(),
			limits: DEDICATED_PLAN.limits,
			channels: m.landing_plan_all_channels()
		},
		{
			name: m.landing_plan_selfhosted(),
			price: m.landing_plan_selfhosted_price(),
			note: '',
			limits: SELF_HOSTED_LIMITS,
			channels: m.landing_plan_all_channels()
		}
	];

	type PlanRow = { label: string; value: (limits: PlanLimits) => string; mono?: boolean };

	/**
	 * One definition of the comparison, read twice: as table rows from `sm` up,
	 * and as a stacked list per plan below it. Five columns do not survive a
	 * 390px viewport, and a table that silently clips is worse than one that
	 * reflows.
	 */
	const planRows: PlanRow[] = [
		{ label: m.landing_plan_row_monitors(), value: (l) => capacity(l.monitors), mono: true },
		{
			label: m.landing_plan_row_interval(),
			value: (l) => `${l.checkIntervalSeconds}s`,
			mono: true
		},
		{ label: m.landing_plan_row_status_pages(), value: (l) => capacity(l.statusPages), mono: true },
		{ label: m.landing_plan_row_members(), value: (l) => capacity(l.teamMembers), mono: true },
		{ label: m.landing_plan_row_retention(), value: (l) => retention(l.retentionDays), mono: true },
		{
			label: m.landing_plan_row_channels(),
			value: (l) =>
				l.notificationChannels.length > 1
					? m.landing_plan_all_channels()
					: m.landing_plan_email_only()
		},
		{ label: m.landing_plan_row_domains(), value: (l) => yesNo(l.customDomains) },
		{ label: m.landing_plan_row_sso(), value: (l) => yesNo(l.sso && l.auditLogs) },
		{ label: m.landing_plan_row_api(), value: (l) => yesNo(l.apiAccess === 'full') }
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
<div class="min-h-screen bg-background">
	<header class="sticky top-0 z-50 border-b bg-card">
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
			<a
				href={resolve('/')}
				class="flex shrink-0 items-center gap-2 text-lg font-semibold text-foreground"
			>
				<img src={logoSvg} alt="" class="size-7" />
				<!-- Below sm the wordmark is not painted — German runs ~30% longer and
				     used to render underneath the buttons at 390px — but it stays in the
				     accessibility tree, so the link is never an unnamed one. -->
				<span class="sr-only sm:not-sr-only">Uppity</span>
			</a>
			<nav class="flex items-center gap-1 sm:gap-3" aria-label={m.landing_footer_product()}>
				<Button variant="ghost" href={resolve('/login')}>{m.landing_cta_sign_in()}</Button>
				<Button href={resolve('/register')}>{m.landing_cta_start_hosted()}</Button>
			</nav>
		</div>
	</header>

	<main class="mx-auto flex max-w-7xl flex-col px-4 pt-16 pb-24 sm:px-6">
		<section class="flex flex-col gap-6">
			<h1 class="text-display text-balance text-foreground">{m.landing_hero_title()}</h1>
			<p class="max-w-[60ch] text-lg text-muted-foreground">{m.landing_hero_subtitle()}</p>
			<div class="flex flex-col gap-3 sm:flex-row">
				<Button size="lg" href={resolve('/register')}>{m.landing_cta_start_hosted()}</Button>
				<Button variant="outline" size="lg" href={GITHUB_URL} rel="noreferrer">
					{m.landing_cta_self_host()}
				</Button>
			</div>
			<!-- The free tier stays discoverable without competing for the headline:
			     signup speed is ground PRODUCT.md deliberately cedes. Naming the
			     ceiling here is what stops anyone meeting it by surprise later. -->
			<p class="text-sm text-muted-foreground">
				{m.landing_hero_free_note({ count: FREE_PLAN.limits.monitors })}
			</p>
		</section>

		<!-- The chart leads: the composition argues with the picture before the prose. -->
		<section class="mt-20 flex flex-col gap-6" aria-labelledby="chart-heading">
			<h2 id="chart-heading" class="text-2xl font-semibold text-foreground">
				{m.landing_chart_title()}
			</h2>
			<PricingCliffChart />
		</section>

		<section class="mt-16 flex flex-col gap-6" aria-labelledby="gate-heading">
			<div class="flex flex-col gap-3">
				<h2 id="gate-heading" class="text-2xl font-semibold text-foreground">
					{m.landing_gate_title()}
				</h2>
				<p class="max-w-[65ch] text-muted-foreground">{m.landing_gate_lede()}</p>
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
								<span class="text-sm text-muted-foreground">Instatus</span>
								<span class="font-mono text-sm text-muted-foreground">{cap.instatus}</span>
							</div>
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-sm text-muted-foreground">Hyperping</span>
								<span class="font-mono text-sm text-muted-foreground">{cap.hyperping}</span>
							</div>
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-sm text-foreground">Uppity</span>
								<span class="font-mono text-sm text-status-up-ink">
									{m.landing_gate_included()}
								</span>
							</div>
							<div class="flex items-baseline justify-between gap-4">
								<span class="text-sm text-foreground">{m.landing_gate_col_selfhosted()}</span>
								<span class="font-mono text-sm text-status-up-ink">{m.landing_gate_free()}</span>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
				<p class="text-sm text-muted-foreground">{m.landing_gate_caption()}</p>
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
								<Table.Head scope="row" class="font-medium text-foreground">{cap.label}</Table.Head>
								<Table.Cell class="text-right font-mono text-muted-foreground">
									{cap.instatus}
								</Table.Cell>
								<Table.Cell class="text-right font-mono text-muted-foreground">
									{cap.hyperping}
								</Table.Cell>
								<Table.Cell class="text-right font-mono text-status-up-ink">
									{m.landing_gate_included()}
								</Table.Cell>
								<Table.Cell class="text-right font-mono text-status-up-ink">
									{m.landing_gate_free()}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</section>

		<section class="mt-40 flex flex-col gap-8" aria-labelledby="principle-heading">
			<div class="h-px w-full bg-primary" role="presentation"></div>
			<h2
				id="principle-heading"
				class="max-w-[16ch] text-4xl leading-[1.1] font-light tracking-[-0.02em] text-foreground sm:text-5xl"
			>
				{m.landing_principle_title()}
			</h2>
			<p class="max-w-[55ch] text-lg leading-relaxed text-muted-foreground">
				{m.landing_principle_body()}
			</p>
		</section>

		<section class="mt-40 flex flex-col gap-6" aria-labelledby="plans-heading">
			<div class="flex flex-col gap-3">
				<h2 id="plans-heading" class="text-2xl font-semibold text-foreground">
					{m.landing_plans_title()}
				</h2>
				<p class="max-w-[65ch] text-muted-foreground">{m.landing_plans_caption()}</p>
			</div>

			<!-- Stacked below sm, tabular above: the same nine rows either way. -->
			<div class="flex flex-col gap-4 sm:hidden">
				{#each plans as plan (plan.name)}
					<Card.Root>
						<Card.Header>
							<Card.Title>{plan.name}</Card.Title>
							<Card.Description>
								<span class="font-mono text-base text-foreground">{plan.price}</span
								>{m.landing_plan_per_month()}{#if plan.note}
									· {plan.note}{/if}
							</Card.Description>
						</Card.Header>
						<Card.Content class="flex flex-col gap-2">
							{#each planRows as row (row.label)}
								<div class="flex items-baseline justify-between gap-4">
									<span class="text-sm text-muted-foreground">{row.label}</span>
									<span class="text-sm text-foreground {row.mono ? 'font-mono' : ''}">
										{row.value(plan.limits)}
									</span>
								</div>
							{/each}
						</Card.Content>
					</Card.Root>
				{/each}
			</div>

			<div class="hidden rounded-xl border bg-card p-2 sm:block">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head scope="col">
								<span class="sr-only">{m.landing_gate_col_capability()}</span>
							</Table.Head>
							{#each plans as plan (plan.name)}
								<Table.Head scope="col" class="text-right align-bottom">
									<span class="block text-foreground">{plan.name}</span>
									<span class="block font-mono text-base text-foreground">
										{plan.price}<span class="text-xs text-muted-foreground"
											>{m.landing_plan_per_month()}</span
										>
									</span>
									{#if plan.note}
										<span class="block text-xs font-normal text-muted-foreground">{plan.note}</span>
									{/if}
								</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each planRows as row (row.label)}
							<Table.Row>
								<Table.Head scope="row" class="font-medium text-foreground">{row.label}</Table.Head>
								{#each plans as plan (plan.name)}
									<Table.Cell class="text-right {row.mono ? 'font-mono' : ''}">
										{row.value(plan.limits)}
									</Table.Cell>
								{/each}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</section>

		<section class="mt-32 flex flex-col gap-4" aria-labelledby="proof-heading">
			<h2 id="proof-heading" class="text-2xl font-semibold text-foreground">
				{m.landing_proof_title()}
			</h2>
			<p class="max-w-[65ch] text-muted-foreground">{m.landing_proof_body()}</p>
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
					class="max-w-[20ch] text-3xl leading-[1.1] font-light tracking-[-0.02em] text-foreground sm:text-4xl"
				>
					{m.landing_close_title()}
				</h2>
				<p class="max-w-[55ch] text-lg text-muted-foreground">{m.landing_close_body()}</p>
			</div>
			<div class="flex flex-col gap-3 sm:flex-row">
				<Button size="lg" href={resolve('/register')}>{m.landing_cta_start_hosted()}</Button>
				<Button variant="outline" size="lg" href={GITHUB_URL} rel="noreferrer">
					{m.landing_cta_self_host()}
				</Button>
			</div>
			<p class="text-sm text-muted-foreground">
				{m.landing_hero_free_note({ count: FREE_PLAN.limits.monitors })}
			</p>
		</section>
	</main>

	<footer class="border-t bg-card">
		<div class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6">
			<div class="grid gap-8 sm:grid-cols-3">
				<div class="flex flex-col gap-3">
					<h2 class="text-sm font-medium text-foreground">{m.landing_footer_product()}</h2>
					<a class="text-sm text-muted-foreground hover:text-foreground" href={STATUS_URL}>
						{m.landing_footer_status()}
					</a>
					<a class="text-sm text-muted-foreground hover:text-foreground" href="#plans-heading">
						{m.landing_footer_pricing()}
					</a>
				</div>
				<div class="flex flex-col gap-3">
					<h2 class="text-sm font-medium text-foreground">{m.landing_footer_selfhost()}</h2>
					<a class="text-sm text-muted-foreground hover:text-foreground" href={GITHUB_URL}>
						{m.landing_footer_github()}
					</a>
					<a
						class="text-sm text-muted-foreground hover:text-foreground"
						href="{GITHUB_URL}#docker-compose"
					>
						{m.landing_footer_docker()}
					</a>
					<a
						class="text-sm text-muted-foreground hover:text-foreground"
						href="{GITHUB_URL}/blob/main/LICENSE"
					>
						{m.landing_footer_license()}
					</a>
				</div>
				<div class="flex flex-col gap-3">
					<h2 class="text-sm font-medium text-foreground">{m.landing_footer_company()}</h2>
					<a
						class="text-sm text-muted-foreground hover:text-foreground"
						href="{GITHUB_URL}/blob/main/SECURITY.md"
					>
						{m.landing_footer_security()}
					</a>
					<a
						class="text-sm text-muted-foreground hover:text-foreground"
						href="mailto:{CONTACT_EMAIL}"
					>
						{m.landing_footer_contact()}
					</a>
				</div>
			</div>
			<Separator />
			<p class="text-xs text-muted-foreground">{m.landing_footer_tagline()}</p>
		</div>
	</footer>
</div>
