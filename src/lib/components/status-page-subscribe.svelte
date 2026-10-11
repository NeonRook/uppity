<script lang="ts">
	import { page } from "$app/state";
	import { Mail } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm, type Infer, type SuperValidated } from "sveltekit-superforms";

	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/paraglide/messages.js";
	import type { subscribeSchema } from "#lib/schemas/status-page-subscriber.js";

	let { data }: { data: SuperValidated<Infer<typeof subscribeSchema>> } = $props();

	const { form, errors, message, enhance, delayed } = superForm(untrack(() => data));
</script>

<section class="bg-card mb-8 rounded-lg border p-6">
	<h2 class="text-foreground mb-1 flex items-center gap-2 text-lg font-semibold">
		<Mail class="text-muted-foreground h-5 w-5" />
		{m.public_subscribe_title()}
	</h2>
	<p class="text-muted-foreground mb-4 text-sm">{m.public_subscribe_description()}</p>

	<form method="POST" action="?/subscribe" use:enhance>
		<Field.Field>
			<Field.Label for="subscribe-email">{m.public_subscribe_email_label()}</Field.Label>
			<div class="flex flex-col gap-2 sm:flex-row">
				<Input
					id="subscribe-email"
					name="email"
					type="email"
					autocomplete="email"
					required
					bind:value={$form.email}
					disabled={$delayed}
					aria-invalid={$errors.email ? "true" : undefined}
				/>
				<Button type="submit" disabled={$delayed}>{m.public_subscribe_submit()}</Button>
			</div>
			<Field.Error errors={$errors.email} />
		</Field.Field>
	</form>

	{#if $message}
		<Alert variant={page.status >= 400 ? "destructive" : "default"} class="mt-4" role="status">
			<AlertDescription>{$message}</AlertDescription>
		</Alert>
	{/if}
</section>
