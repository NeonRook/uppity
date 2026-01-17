<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';

	interface Props {
		title: string;
		value: string | number;
		description?: string;
		icon: Component<IconProps>;
		/** Optional color class for the icon (e.g., "text-green-500") */
		iconClass?: string;
	}

	let {
		title,
		value,
		description,
		icon: Icon,
		iconClass = 'text-muted-foreground'
	}: Props = $props();
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
		<Card.Title class="text-sm font-medium">{title}</Card.Title>
		<Icon class="h-4 w-4 {iconClass}" />
	</Card.Header>
	<Card.Content>
		<div class="text-2xl font-bold">{value}</div>
		{#if description}
			<p class="text-xs text-muted-foreground">{description}</p>
		{/if}
	</Card.Content>
</Card.Root>
