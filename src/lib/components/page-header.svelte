<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft } from '@lucide/svelte';

	interface Props {
		/** URL for the back button */
		backHref: string;
		/** Page title (used when children slot is not provided) */
		title?: string;
		/** Page description (used when children slot is not provided) */
		description?: string;
		/** Custom content for the header (replaces title/description) */
		children?: Snippet;
		/** Actions slot for buttons/badges on the right side */
		actions?: Snippet;
	}

	let { backHref, title, description, children, actions }: Props = $props();
</script>

<div class="flex items-center gap-4">
	<Button variant="ghost" size="icon" href={backHref}>
		<ArrowLeft class="h-4 w-4" />
	</Button>
	<div class="flex-1">
		{#if children}
			{@render children()}
		{:else}
			<h1 class="text-2xl font-bold tracking-tight">{title}</h1>
			{#if description}
				<p class="text-muted-foreground">{description}</p>
			{/if}
		{/if}
	</div>
	{#if actions}
		{@render actions()}
	{/if}
</div>
