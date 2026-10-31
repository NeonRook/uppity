<script lang="ts">
	import { enhance } from "$app/forms";

	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { form } = $props();
</script>

<svelte:head>
	<title>{m.invitation_unsubscribe_title()} - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-2xl font-bold">{m.invitation_unsubscribe_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if form?.done}
			<p>{m.invitation_unsubscribe_done()}</p>
		{:else}
			<p>{m.invitation_unsubscribe_prompt()}</p>
			<form method="POST" use:enhance>
				<Button type="submit">{m.invitation_unsubscribe_submit()}</Button>
			</form>
		{/if}
	</Card.Content>
</Card.Root>
