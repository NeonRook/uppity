<script lang="ts">
	import { resolve } from "$app/paths";

	import * as Card from "#lib/components/ui/card/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();
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
		<a href={resolve("dashboard")} class="text-primary underline-offset-4 hover:underline">
			{m.verify_email_continue()}
		</a>
	</Card.Content>
</Card.Root>
