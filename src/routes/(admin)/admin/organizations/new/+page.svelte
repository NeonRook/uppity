<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, ArrowLeft } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const { form, errors, message, enhance, delayed } = superForm(untrack(() => data.form));

	// Auto-generate slug from name
	function generateSlug(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
	}

	let autoSlug = $state(true);

	$effect(() => {
		if (autoSlug && $form.name) {
			$form.slug = generateSlug($form.name);
		}
	});

	function handleSlugChange() {
		autoSlug = false;
	}
</script>

<svelte:head>
	<title>{m.admin_orgs_create()} - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/organizations">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold">{m.admin_orgs_create()}</h1>
	</div>

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
						oninput={handleSlugChange}
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
