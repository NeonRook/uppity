<script lang="ts">
	import { Search } from "@lucide/svelte";

	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { ScrollArea } from "#lib/components/ui/scroll-area/index.js";
	import { m } from "#lib/paraglide/messages.js";

	interface MonitorOption {
		id: string;
		name: string;
	}

	interface Props {
		monitors: MonitorOption[];
		/** Selected monitor ids. Bound, so the parent's superform store stays the source of truth. */
		selected: string[];
		disabled?: boolean;
		/**
		 * Render the selection as a plain list instead of a checkbox field. Used for
		 * windows that are over: hunting for three ticked boxes among two thousand
		 * disabled ones is not a read view.
		 */
		readOnly?: boolean;
	}

	let { monitors, selected = $bindable(), disabled = false, readOnly = false }: Props = $props();

	/** Past this many monitors the list gets a filter and scrolls inside a fixed frame. */
	const LONG_LIST = 8;

	let filter = $state("");

	const normalisedFilter = $derived(filter.trim().toLowerCase());
	const visible = $derived(
		normalisedFilter === ""
			? monitors
			: monitors.filter((mon) => mon.name.toLowerCase().includes(normalisedFilter)),
	);
	const selectedMonitors = $derived(monitors.filter((mon) => selected.includes(mon.id)));

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((mid) => mid !== id) : [...selected, id];
	}
</script>

{#if monitors.length === 0}
	<p class="text-muted-foreground py-4 text-center text-sm">{m.maintenance_form_no_monitors()}</p>
{:else if readOnly}
	<ul class="space-y-2">
		{#each selectedMonitors as monitor (monitor.id)}
			<li class="rounded-lg border p-2 text-sm font-medium">{monitor.name}</li>
		{/each}
	</ul>
{:else}
	<div class="space-y-3">
		<div class="flex flex-wrap items-center gap-2">
			{#if monitors.length > LONG_LIST}
				<div class="relative min-w-0 flex-1">
					<Search
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
						aria-hidden="true"
					/>
					<Input
						type="search"
						class="pl-9"
						placeholder={m.maintenance_form_filter_monitors()}
						aria-label={m.maintenance_form_filter_monitors()}
						bind:value={filter}
						{disabled}
					/>
				</div>
			{/if}
			<Badge variant="outline"
				>{m.maintenance_form_selected_count({ count: selected.length })}</Badge
			>
			{#if !disabled && visible.some((mon) => !selected.includes(mon.id))}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => (selected = [...new Set([...selected, ...visible.map((mon) => mon.id)])])}
				>
					{m.maintenance_form_select_all()}
				</Button>
			{/if}
			{#if selected.length > 0 && !disabled}
				<Button type="button" variant="ghost" size="sm" onclick={() => (selected = [])}>
					{m.maintenance_form_clear_selection()}
				</Button>
			{/if}
		</div>

		{#if visible.length === 0}
			<p class="text-muted-foreground py-4 text-center text-sm">
				{m.maintenance_form_no_filter_matches()}
			</p>
		{:else}
			{#snippet rows()}
				<ul class="divide-y">
					{#each visible as monitor (monitor.id)}
						<li>
							<label
								class="flex items-center gap-3 px-4 py-2.5 transition-colors {disabled
									? 'cursor-not-allowed opacity-60'
									: 'hover:bg-muted/50 cursor-pointer'}"
							>
								<Checkbox
									checked={selected.includes(monitor.id)}
									onCheckedChange={() => toggle(monitor.id)}
									{disabled}
								/>
								<span class="flex-1 truncate text-sm font-medium">{monitor.name}</span>
							</label>
						</li>
					{/each}
				</ul>
			{/snippet}
			{#if visible.length > LONG_LIST}
				<ScrollArea class="h-96 overflow-hidden rounded-lg border">{@render rows()}</ScrollArea>
			{:else}
				<div class="overflow-hidden rounded-lg border">{@render rows()}</div>
			{/if}
		{/if}
	</div>
{/if}
