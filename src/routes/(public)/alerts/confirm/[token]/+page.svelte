<script lang="ts">
	import { enhance } from "$app/forms";

	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const recipient = $derived(data.recipient);
</script>

<svelte:head>
	<title>{m.alerts_confirm_title()} - Uppity</title>
</svelte:head>

<h1 class="mb-4 text-xl font-semibold">{m.alerts_confirm_title()}</h1>
{#if recipient?.state === "pending"}
	<p class="mb-4">
		{m.alerts_confirm_prompt({ organization: recipient.organizationName, email: recipient.email })}
	</p>
	<form method="POST" use:enhance>
		<Button type="submit">{m.alerts_confirm_submit()}</Button>
	</form>
{:else if recipient?.state === "confirmed"}
	<p>
		{m.alerts_confirm_done({ organization: recipient.organizationName, email: recipient.email })}
	</p>
{:else}
	<p>{m.alerts_confirm_invalid()}</p>
{/if}
