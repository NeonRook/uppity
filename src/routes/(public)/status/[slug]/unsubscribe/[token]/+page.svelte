<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import { ArrowLeft } from "@lucide/svelte";

	import StatusPageShell from "#lib/components/status-page-shell.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const { page, subscribed } = $derived(data);
</script>

<StatusPageShell {page} title={m.public_unsubscribe_page_title({ name: page.name })}>
	<a
		href={resolve(`status/${page.slug}`)}
		class="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
	>
		<ArrowLeft class="h-4 w-4" />
		{m.public_incident_back()}
	</a>

	<div class="bg-card text-foreground rounded-lg border p-6">
		{#if subscribed}
			<p class="mb-4">{m.public_unsubscribe_prompt({ name: page.name })}</p>
			<form method="POST" use:enhance>
				<Button type="submit">{m.public_unsubscribe_submit()}</Button>
			</form>
		{:else}
			<p>{m.public_unsubscribe_done({ name: page.name })}</p>
		{/if}
	</div>
</StatusPageShell>
