<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';

	interface Props {
		/** Explicit open state (use this for detail pages) */
		open?: boolean;
		/** The ID of the item to delete (use this for list pages, opens dialog when not null) */
		itemId?: string | null;
		/** Callback when dialog open state changes */
		onOpenChange: (open: boolean) => void;
		/** Callback to perform the delete operation */
		onDelete: (id: string) => Promise<void>;
		/** Dialog title */
		title: string;
		/** Dialog description/warning message */
		description: string;
	}

	let { open, itemId, onOpenChange, onDelete, title, description }: Props = $props();

	let deleting = $state(false);

	// Use explicit `open` prop if provided, otherwise check if itemId is set
	const isOpen = $derived(open ?? itemId !== null);

	function handleOpenChange(openState: boolean) {
		if (!openState) {
			onOpenChange(false);
		}
	}

	async function handleDelete() {
		// Get the ID to delete - either from itemId or we're using explicit open mode
		// In explicit open mode, the parent should pass itemId or handle the ID themselves
		const id = itemId;
		if (!id) return;

		deleting = true;
		try {
			await onDelete(id);
			onOpenChange(false);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Delete failed');
		} finally {
			deleting = false;
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
			<AlertDialog.Cancel onclick={() => onOpenChange(false)}
				>{m.common_cancel()}</AlertDialog.Cancel
			>
			<Button onclick={handleDelete} variant="destructive" disabled={deleting}>
				{deleting ? m.common_deleting() : m.common_delete()}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
