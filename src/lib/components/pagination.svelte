<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	interface Props {
		/** Current page number (1-indexed) */
		page: number;
		/** Total number of pages */
		totalPages: number;
		/** Items per page */
		limit: number;
		/** Total number of items */
		total: number;
		/** Name of the items (e.g., "users", "organizations") */
		itemName: string;
		/** Callback when page changes */
		onPageChange: (page: number) => void;
	}

	let { page, totalPages, limit, total, itemName, onPageChange }: Props = $props();

	const showingFrom = $derived((page - 1) * limit + 1);
	const showingTo = $derived(Math.min(page * limit, total));
</script>

{#if totalPages > 1}
	<div class="mt-4 flex items-center justify-between">
		<p class="text-sm text-muted-foreground">
			Showing {showingFrom} to {showingTo} of {total}
			{itemName}
		</p>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				disabled={page <= 1}
				onclick={() => onPageChange(page - 1)}
			>
				<ChevronLeft class="h-4 w-4" />
			</Button>
			<span class="text-sm">
				Page {page} of {totalPages}
			</span>
			<Button
				variant="outline"
				size="icon"
				disabled={page >= totalPages}
				onclick={() => onPageChange(page + 1)}
			>
				<ChevronRight class="h-4 w-4" />
			</Button>
		</div>
	</div>
{/if}
