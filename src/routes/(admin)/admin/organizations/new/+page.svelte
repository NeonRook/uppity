<script lang="ts">
	import { CircleAlert, LoaderCircle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import PageHeader from "#lib/components/page-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { generateSlug } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const { form, errors, message, enhance, delayed } = superForm(untrack(() => data.form));

	let autoSlug = true;
</script>

<svelte:head>
	<title>{m.admin_orgs_create()} - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader backHref="/admin/organizations" title={m.admin_orgs_create()} />

	<Card.Root>
		<Card.Content class="pt-6">
			<form method="POST" use:enhance class="space-y-4">
				{#if $message}
					<Alert variant="destructive">
						<CircleAlert class="h-4 w-4" />
						<AlertDescription>{$message}</AlertDescription>
					</Alert>
				{/if}

				<Field.Field>
					<Field.Label for="name">{m.common_name()}</Field.Label>
					<Input
						id="name"
						name="name"
						bind:value={$form.name}
						disabled={$delayed}
						placeholder="Acme Inc."
						oninput={(e) => {
							if (autoSlug) $form.slug = generateSlug(e.currentTarget.value);
						}}
					/>
					<Field.Error errors={$errors.name} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="slug">{m.admin_orgs_slug()}</Field.Label>
					<Input
						id="slug"
						name="slug"
						bind:value={$form.slug}
						disabled={$delayed}
						placeholder="acme-inc"
						oninput={() => (autoSlug = false)}
					/>
					<Field.Description>
						{m.admin_orgs_slug_desc()}
					</Field.Description>
					<Field.Error errors={$errors.slug} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="logo">{m.admin_orgs_logo()}</Field.Label>
					<Input
						id="logo"
						name="logo"
						type="url"
						bind:value={$form.logo}
						disabled={$delayed}
						placeholder={m.admin_orgs_logo_placeholder()}
					/>
					<Field.Error errors={$errors.logo} />
				</Field.Field>

				<div class="flex gap-2 pt-4">
					<Button type="submit" disabled={$delayed}>
						{#if $delayed}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
							{m.admin_orgs_creating()}
						{:else}
							{m.admin_orgs_create()}
						{/if}
					</Button>
					<Button variant="outline" href="/admin/organizations" disabled={$delayed}
						>{m.common_cancel()}</Button
					>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
