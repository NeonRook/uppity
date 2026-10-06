<script lang="ts">
	import { refreshAll } from "$app/navigation";
	import { LoaderCircle, Minus, Plus } from "@lucide/svelte";
	import { toast } from "svelte-sonner";

	import UsageBar from "#lib/components/billing/usage-bar.svelte";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import {
		MAX_MONITOR_BLOCKS,
		MONITOR_BLOCK_ANNUAL_PRICE_CENTS,
		MONITOR_BLOCK_PRICE_CENTS,
		MONITOR_BLOCK_SIZE,
		UPPITY_PLAN,
	} from "#lib/constants/plans.js";
	import { formatUsdCents } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getLocale } from "#lib/paraglide/runtime.js";
	import { setCapacityBlocks } from "#lib/remote/billing.remote.js";

	interface Props {
		blocks: number;
		scheduledBlocks: number | null;
		/** Null when the billing interval is unknown; changes are refused until it is. */
		annual: boolean | null;
		canManage: boolean;
		periodEnd: string | null;
		monitorsUsed: number;
	}

	let { blocks, scheduledBlocks, annual, canManage, periodEnd, monitorsUsed }: Props = $props();

	const included = UPPITY_PLAN.limits.monitors;
	const basePrice = $derived(
		annual ? (UPPITY_PLAN.annualPriceCents ?? 0) : (UPPITY_PLAN.monthlyPriceCents ?? 0),
	);
	const blockPrice = $derived(
		annual ? MONITOR_BLOCK_ANNUAL_PRICE_CENTS : MONITOR_BLOCK_PRICE_CENTS,
	);
	const per = $derived(annual ? m.billing_per_year() : m.billing_per_month());

	// What the count will be once any scheduled reduction lands.
	const committed = $derived(scheduledBlocks ?? blocks);
	// Resets to the saved count whenever the page data refreshes.
	let draft = $derived(committed);
	let monitorsWanted = $state<number | undefined>();
	let saving = $state(false);
	let confirming = $state(false);

	const ceilingFor = (count: number) => included + MONITOR_BLOCK_SIZE * count;
	const dirty = $derived(draft !== committed);
	const increase = $derived(draft > blocks);

	const locale = $derived(getLocale());
	const money = (cents: number) => formatUsdCents(cents, locale);
	// Null only before Polar has reported a period; a reduction then applies at once.
	const periodEndText = $derived(
		periodEnd ? new Date(periodEnd).toLocaleDateString(locale, { dateStyle: "long" }) : null,
	);

	function setDraft(count: number) {
		draft = Math.min(Math.max(count, 0), MAX_MONITOR_BLOCKS);
	}

	function fromMonitors() {
		if (monitorsWanted === undefined || Number.isNaN(monitorsWanted)) return;
		setDraft(Math.ceil(Math.max(monitorsWanted - included, 0) / MONITOR_BLOCK_SIZE));
	}

	function save() {
		// The annual meter bills the year's peak, so an increase is a commitment until renewal.
		if (annual && increase && periodEndText !== null) {
			confirming = true;
			return;
		}
		void write(draft);
	}

	async function write(count: number) {
		confirming = false;
		saving = true;
		try {
			const result = await setCapacityBlocks({ blocks: count });
			if (!result.ok) {
				toast.error(refusal(result));
				return;
			}
			if (result.scheduledBlocks !== null && periodEndText !== null) {
				toast.success(m.billing_block_saved_reduction({ date: periodEndText }));
			} else {
				toast.success(m.billing_block_saved());
			}
			monitorsWanted = undefined;
			await refreshAll();
		} catch {
			toast.error(m.billing_block_error());
		} finally {
			saving = false;
		}
	}

	function refusal(result: Exclude<Awaited<ReturnType<typeof setCapacityBlocks>>, { ok: true }>) {
		switch (result.reason) {
			case "multi_org_customer":
				return result.organizationName === null
					? m.billing_block_error_multi_org_unnamed()
					: m.billing_block_error_multi_org({ organization: result.organizationName });
			case "above_max":
				return m.billing_block_max({ max: result.max });
			default:
				return m.billing_block_error();
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.billing_block_title()}</Card.Title>
		<Card.Description>
			{m.billing_block_desc({ included, size: MONITOR_BLOCK_SIZE })}
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-6">
		<UsageBar current={monitorsUsed} limit={ceilingFor(blocks)} label="monitors" />

		{#if scheduledBlocks !== null && periodEndText !== null}
			<div
				class="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3"
			>
				<p class="text-sm">
					{m.billing_block_pending({ count: ceilingFor(scheduledBlocks), date: periodEndText })}
				</p>
				{#if canManage}
					<Button variant="ghost" size="sm" disabled={saving} onclick={() => write(blocks)}>
						{m.billing_block_cancel_reduction()}
					</Button>
				{/if}
			</div>
		{/if}

		{#if canManage && annual === null}
			<p class="text-muted-foreground text-sm">{m.billing_block_interval_unknown()}</p>
		{:else if canManage}
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div class="space-y-2">
					<p class="text-sm font-medium" id="capacity-blocks-label">
						{m.billing_block_count_label()}
					</p>
					<div class="flex items-center gap-3" role="group" aria-labelledby="capacity-blocks-label">
						<Button
							variant="outline"
							size="icon"
							aria-label={m.billing_block_decrease()}
							disabled={saving || draft === 0}
							onclick={() => setDraft(draft - 1)}
						>
							<Minus class="h-4 w-4" />
						</Button>
						<span class="w-8 text-center text-lg" aria-live="polite">{draft}</span>
						<Button
							variant="outline"
							size="icon"
							aria-label={m.billing_block_increase()}
							disabled={saving || draft === MAX_MONITOR_BLOCKS}
							onclick={() => setDraft(draft + 1)}
						>
							<Plus class="h-4 w-4" />
						</Button>
					</div>
				</div>
				<div class="text-right">
					<p class="text-muted-foreground text-sm">{m.billing_block_ceiling_label()}</p>
					<p class="text-2xl font-semibold">{ceilingFor(draft)}</p>
					<p class="text-muted-foreground text-sm">
						{money(basePrice + blockPrice * draft)}{per}
					</p>
				</div>
			</div>

			<div class="max-w-xs space-y-2">
				<Label for="capacity-monitors-wanted" class="text-muted-foreground font-normal">
					{m.billing_block_target_label()}
				</Label>
				<Input
					id="capacity-monitors-wanted"
					type="number"
					min={0}
					step={MONITOR_BLOCK_SIZE}
					bind:value={monitorsWanted}
					oninput={fromMonitors}
					disabled={saving}
				/>
			</div>

			{#if draft === MAX_MONITOR_BLOCKS}
				<p class="text-sm">
					{m.billing_block_max({ max: MAX_MONITOR_BLOCKS })}
					<a href="mailto:sales@uppity.app" class="underline underline-offset-4">
						{m.billing_contact_sales()}
					</a>
				</p>
			{/if}

			<p class="text-muted-foreground text-sm">
				{annual ? m.billing_block_note_annual() : m.billing_block_note_monthly()}
			</p>
		{:else}
			<p class="text-muted-foreground text-sm">{m.billing_block_read_only()}</p>
		{/if}
	</Card.Content>
	{#if canManage && annual !== null}
		<Card.Footer class="justify-end gap-2">
			<Button variant="ghost" disabled={!dirty || saving} onclick={() => setDraft(committed)}>
				{m.billing_block_reset()}
			</Button>
			<Button disabled={!dirty || saving} onclick={save}>
				{#if saving}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				{m.billing_block_save()}
			</Button>
		</Card.Footer>
	{/if}
</Card.Root>

<AlertDialog.Root bind:open={confirming}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.billing_block_confirm_title()}</AlertDialog.Title>
			{#if periodEndText !== null}
				<AlertDialog.Description>
					{m.billing_block_confirm_desc({
						date: periodEndText,
						amount: money(blockPrice * draft),
						count: MONITOR_BLOCK_SIZE * draft,
					})}
				</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={() => write(draft)}>
				{m.billing_block_confirm_action()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
