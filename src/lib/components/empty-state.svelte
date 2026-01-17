<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Plus } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';

	interface Props {
		icon: Component<IconProps>;
		title: string;
		description: string;
		buttonText?: string;
		buttonHref?: string;
		/** If true, wraps the content in a Card. Default: true */
		withCard?: boolean;
	}

	let { icon: Icon, title, description, buttonText, buttonHref, withCard = true }: Props = $props();
</script>

{#if withCard}
	<Card.Root>
		<Card.Content class="pt-6">
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<Icon class="h-12 w-12 text-muted-foreground/50" />
				<h3 class="mt-4 text-lg font-semibold">{title}</h3>
				<p class="mt-2 mb-4 text-sm text-muted-foreground">{description}</p>
				{#if buttonText && buttonHref}
					<Button href={buttonHref}>
						<Plus class="mr-2 h-4 w-4" />
						{buttonText}
					</Button>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
{:else}
	<div class="flex flex-col items-center justify-center py-12 text-center">
		<Icon class="h-12 w-12 text-muted-foreground/50" />
		<h3 class="mt-4 text-lg font-semibold">{title}</h3>
		<p class="mt-2 mb-4 text-sm text-muted-foreground">{description}</p>
		{#if buttonText && buttonHref}
			<Button href={buttonHref}>
				<Plus class="mr-2 h-4 w-4" />
				{buttonText}
			</Button>
		{/if}
	</div>
{/if}
