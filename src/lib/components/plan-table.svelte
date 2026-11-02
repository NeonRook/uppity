<script lang="ts" module>
	import { formatUsdCents } from "#lib/format.js";
	import { getLocale } from "#lib/paraglide/runtime.js";

	/**
	 * DESIGN.md's Measured-Value Rule decides mono per value, not per row: "50"
	 * and "30 days" are readings, "Unlimited" is a word, and
	 * they share a column. Carrying the distinction on the value is what stops a
	 * row-level flag from setting an English sentence in Plex Mono.
	 */
	export type Reading = { text: string; mono: boolean };
	export const reading = (text: string): Reading => ({ text, mono: true });
	export const word = (text: string): Reading => ({ text, mono: false });

	/** USD everywhere, written the way the reader's locale writes it. */
	export const usd = (cents: number | null): Reading =>
		cents === null ? word("—") : reading(formatUsdCents(cents, getLocale()));
</script>

<script lang="ts">
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Table from "#lib/components/ui/table/index.js";
	import { FREE_PLAN, SELF_HOSTED_LIMITS } from "#lib/constants/plans.js";
	import { m } from "#lib/paraglide/messages.js";
	import type { PlanLimits } from "#lib/types/plans.js";

	let { class: className = "" }: { class?: string } = $props();

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
		{
			label: m.landing_plan_row_monitors(),
			value: (l) => capacity(l.monitors),
		},

		{
			label: m.landing_plan_row_interval(),
			value: (l) => reading(`${l.checkIntervalSeconds}s`),
		},

		{
			label: m.landing_plan_row_status_pages(),
			value: (l) => capacity(l.statusPages),
		},

		{
			label: m.landing_plan_row_members(),
			value: (l) => capacity(l.teamMembers),
		},

		{
			label: m.landing_plan_row_retention(),
			value: (l) => retention(l.retentionDays),
		},

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
		{ label: m.landing_plan_row_api(), value: (l) => yesNo(l.apiAccess !== "none") },
	];
</script>

<section class="flex flex-col gap-6 {className}" aria-labelledby="plans-heading">
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

	<!-- Bare rather than in a card: card padding would inset the row labels
	     from the left rail the surrounding sections read from. -->
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
