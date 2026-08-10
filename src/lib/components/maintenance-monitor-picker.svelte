<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Input } from "$lib/components/ui/input";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { m } from "$lib/paraglide/messages.js";
	import { Search } from "@lucide/svelte";

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
			<li class="rounded-md border p-2 text-sm font-medium">{monitor.name}</li>
		{/each}
	</ul>
{:else}
	<div class="space-y-3">
		<div class="flex flex-wrap items-center gap-2">
			<div class="relative min-w-0 flex-1">
				<Search
					class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
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
			<Badge variant="outline"
				>{m.maintenance_form_selected_count({ count: selected.length })}</Badge
			>
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
			<ScrollArea class="h-96 rounded-md border p-3">
				<div class="space-y-2">
					{#each visible as monitor (monitor.id)}
						<label
							class="flex items-center gap-3 rounded-md border p-2 transition-colors {disabled
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
					{/each}
				</div>
			</ScrollArea>
		{/if}
	</div>
{/if}
