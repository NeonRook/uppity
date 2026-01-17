<script lang="ts">
	import { enhance } from '$app/forms';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		/** Explicit open state (use this for detail pages) */
		open?: boolean;
		/** The ID of the item to delete (use this for list pages, opens dialog when not null) */
		itemId?: string | null;
		/** Callback when dialog open state changes */
		onOpenChange: (open: boolean) => void;
		/** Dialog title */
		title: string;
		/** Dialog description/warning message */
		description: string;
		/** The form action path, defaults to "?/delete" */
		action?: string;
		/** The name of the hidden input field for the ID (only needed with itemId) */
		inputName?: string;
	}

	let {
		open,
		itemId,
		onOpenChange,
		title,
		description,
		action = '?/delete',
		inputName
	}: Props = $props();

	let deleting = $state(false);

	// Use explicit `open` prop if provided, otherwise check if itemId is set
	const isOpen = $derived(open ?? itemId !== null);

	function handleOpenChange(openState: boolean) {
		if (!openState) {
			onOpenChange(false);
		}
	}
</script>

<AlertDialog.Root open={isOpen} onOpenChange={handleOpenChange}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => onOpenChange(false)}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				{action}
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
						onOpenChange(false);
					};
				}}
			>
				{#if itemId && inputName}
					<input type="hidden" name={inputName} value={itemId} />
				{/if}
				<Button type="submit" variant="destructive" disabled={deleting}>
					{deleting ? 'Deleting...' : 'Delete'}
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
