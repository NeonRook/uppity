<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import { Plus } from "@lucide/svelte";
	import type { IconProps } from "@lucide/svelte";
	import type { Component } from "svelte";

	interface Props {
		icon: Component<IconProps>;
		title: string;
		description: string;
		buttonText?: string;
		buttonHref?: string;
		/** If true, wraps the content in a Card. Default: true */
		withCard?: boolean;
		/** Disable the button (e.g., when limit reached) */
		buttonDisabled?: boolean;
		/** Tooltip message when button is disabled */
		buttonDisabledMessage?: string;
	}

	let {
		icon: Icon,
		title,
		description,
		buttonText,
		buttonHref,
		withCard = true,
		buttonDisabled = false,
		buttonDisabledMessage,
	}: Props = $props();
</script>

{#snippet actionButton()}
	{#if buttonText && buttonHref}
		{#if buttonDisabled && buttonDisabledMessage}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button disabled>
						<Plus class="mr-2 h-4 w-4" />
						{buttonText}
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{buttonDisabledMessage}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{:else}
			<Button href={buttonHref} disabled={buttonDisabled}>
				<Plus class="mr-2 h-4 w-4" />
				{buttonText}
			</Button>
		{/if}
	{/if}
{/snippet}

{#if withCard}
	<Card.Root>
		<Card.Content class="pt-6">
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<Icon class="text-muted-foreground/50 h-12 w-12" />
				<h3 class="mt-4 text-lg font-semibold">{title}</h3>
				<p class="text-muted-foreground mt-2 mb-4 text-sm">{description}</p>
				{@render actionButton()}
			</div>
		</Card.Content>
	</Card.Root>
{:else}
	<div class="flex flex-col items-center justify-center py-12 text-center">
		<Icon class="text-muted-foreground/50 h-12 w-12" />
		<h3 class="mt-4 text-lg font-semibold">{title}</h3>
		<p class="text-muted-foreground mt-2 mb-4 text-sm">{description}</p>
		{@render actionButton()}
	</div>
{/if}
