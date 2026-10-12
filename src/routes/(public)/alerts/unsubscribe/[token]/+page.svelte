<script lang="ts">
	import { enhance } from "$app/forms";

	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const recipient = $derived(data.recipient);
</script>

<svelte:head>
	<title>{m.alerts_unsubscribe_title()} - Uppity</title>
</svelte:head>

<h1 class="mb-4 text-xl font-semibold">{m.alerts_unsubscribe_title()}</h1>
{#if recipient && recipient.state !== "unsubscribed"}
	<p class="mb-4">
		{m.alerts_unsubscribe_prompt({
			organization: recipient.organizationName,
			email: recipient.email,
		})}
	</p>
	<p class="text-muted-foreground mb-4 text-sm">
		{recipient.reasked
			? m.alerts_unsubscribe_final({ organization: recipient.organizationName })
			: m.alerts_unsubscribe_reask({ organization: recipient.organizationName })}
	</p>
	<form method="POST" use:enhance>
		<Button type="submit">{m.alerts_unsubscribe_submit()}</Button>
	</form>
{:else}
	<p>{m.alerts_unsubscribe_done()}</p>
{/if}
