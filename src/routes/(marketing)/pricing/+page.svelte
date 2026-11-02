<script lang="ts">
	import { resolve } from "$app/paths";

	import PlanTable from "#lib/components/plan-table.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { GITHUB_URL } from "#lib/constants/links.js";
	import { FREE_PLAN } from "#lib/constants/plans.js";
	import { m } from "#lib/paraglide/messages.js";
</script>

<svelte:head>
	<title>{m.pricing_page_title()}</title>
	<meta name="description" content={m.pricing_meta_description()} />
	<meta property="og:title" content={m.pricing_page_title()} />
	<meta property="og:description" content={m.pricing_meta_description()} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={m.pricing_page_title()} />
	<meta name="twitter:description" content={m.pricing_meta_description()} />
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col px-4 pt-16 pb-24 sm:px-6">
	<section class="flex flex-col gap-6">
		<h1 class="text-display text-foreground text-balance">{m.pricing_title()}</h1>
		<p class="text-muted-foreground max-w-[60ch] text-lg text-balance">{m.pricing_lede()}</p>
	</section>

	<PlanTable class="mt-20" />

	<section class="mt-32 flex flex-col gap-6" aria-labelledby="principle-heading">
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
		<div class="flex flex-col gap-3 sm:flex-row">
			<Button size="lg" href={resolve("register")}>{m.landing_cta_start_hosted()}</Button>
			<Button variant="outline" size="lg" href={GITHUB_URL} rel="noreferrer">
				{m.landing_cta_self_host()}
			</Button>
		</div>
		<p class="text-muted-foreground text-sm">
			{m.landing_hero_free_note({ count: FREE_PLAN.limits.monitors })}
		</p>
	</section>
</main>
