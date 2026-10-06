<script lang="ts">
	import type { LucideIcon } from "@lucide/svelte";

	import AddButton from "#lib/components/add-button.svelte";
	import * as Card from "#lib/components/ui/card/index.js";

	interface Props {
		icon: LucideIcon;
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

{#snippet content()}
	<div class="flex flex-col items-center justify-center py-12 text-center">
		<Icon class="text-muted-foreground/50 h-12 w-12" />
		<h3 class="mt-4 text-lg font-semibold">{title}</h3>
		<p class="text-muted-foreground mt-2 mb-4 text-sm">{description}</p>
		{#if buttonText && buttonHref}
			<AddButton
				href={buttonHref}
				text={buttonText}
				disabled={buttonDisabled}
				disabledMessage={buttonDisabledMessage}
			/>
		{/if}
	</div>
{/snippet}

{#if withCard}
	<Card.Root>
		<Card.Content class="pt-6">
			{@render content()}
		</Card.Content>
	</Card.Root>
{:else}
	{@render content()}
{/if}
