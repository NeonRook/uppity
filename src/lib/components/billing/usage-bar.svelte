<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		current: number;
		limit: number;
		label: 'monitors' | 'statusPages';
	}

	let { current, limit, label }: Props = $props();

	const isUnlimited = $derived(limit === -1);
	const percentage = $derived(isUnlimited ? 0 : Math.min((current / limit) * 100, 100));
	const barColor = $derived.by(() => {
		if (percentage >= 100) return 'bg-destructive';
		if (percentage >= 80) return 'bg-yellow-500';
		return 'bg-primary';
	});

	const labelText = $derived(
		label === 'monitors' ? m.billing_monitors() : m.billing_status_pages()
	);
</script>

<div class="space-y-1.5">
	<div class="flex justify-between text-sm">
		<span class="text-muted-foreground">{labelText}</span>
		<span class="font-medium">
			{current}
			{#if isUnlimited}
				/ ∞
			{:else}
				/ {limit}
			{/if}
		</span>
	</div>
	{#if !isUnlimited}
		<div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
			<div class="h-full transition-all duration-300 {barColor}" style="width: {percentage}%"></div>
		</div>
	{/if}
</div>
