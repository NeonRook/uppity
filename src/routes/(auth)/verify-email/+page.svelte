<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";

	import { signOut } from "#lib/auth-client.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	// Signed out, the same link sends the visitor through login as the right account.
	async function switchAccount() {
		await signOut();
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{m.verify_email_title()} - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-2xl font-bold">{m.verify_email_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		<p>
			{data.outcome === "other_account"
				? m.verify_email_other_account({ email: data.email })
				: m.verify_email_invalid()}
		</p>
		{#if data.outcome === "other_account"}
			<Button onclick={switchAccount}>{m.verify_email_switch_account()}</Button>
		{:else}
			<a href={resolve("dashboard")} class="text-primary underline-offset-4 hover:underline">
				{m.verify_email_continue()}
			</a>
		{/if}
	</Card.Content>
</Card.Root>
