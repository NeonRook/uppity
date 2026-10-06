<script lang="ts">
	import { Plus } from "@lucide/svelte";

	import { Button } from "#lib/components/ui/button/index.js";
	import * as Tooltip from "#lib/components/ui/tooltip/index.js";

	interface Props {
		href: string;
		text: string;
		disabled?: boolean;
		/** Tooltip shown instead of a link while disabled (e.g., when a plan limit is reached). */
		disabledMessage?: string;
	}

	let { href, text, disabled = false, disabledMessage }: Props = $props();
</script>

{#if disabled && disabledMessage}
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Button disabled>
				<Plus class="mr-2 h-4 w-4" />
				{text}
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{disabledMessage}</p>
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	<Button {href} {disabled}>
		<Plus class="mr-2 h-4 w-4" />
		{text}
	</Button>
{/if}
