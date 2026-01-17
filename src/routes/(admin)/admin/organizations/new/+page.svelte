<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, ArrowLeft } from '@lucide/svelte';

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
	<title>Create Organization - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/organizations">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold">Create Organization</h1>
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

				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input
						id="name"
						name="name"
						bind:value={$form.name}
						disabled={$delayed}
						placeholder="Acme Inc."
					/>
					{#if $errors.name}
						<p class="text-sm text-destructive">{$errors.name}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="slug">Slug</Label>
					<Input
						id="slug"
						name="slug"
						bind:value={$form.slug}
						disabled={$delayed}
						placeholder="acme-inc"
						oninput={handleSlugChange}
					/>
					<p class="text-xs text-muted-foreground">
						Used in URLs. Only lowercase letters, numbers, and hyphens.
					</p>
					{#if $errors.slug}
						<p class="text-sm text-destructive">{$errors.slug}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="logo">Logo URL (optional)</Label>
					<Input
						id="logo"
						name="logo"
						type="url"
						bind:value={$form.logo}
						disabled={$delayed}
						placeholder="https://example.com/logo.png"
					/>
					{#if $errors.logo}
						<p class="text-sm text-destructive">{$errors.logo}</p>
					{/if}
				</div>

				<div class="flex gap-2 pt-4">
					<Button type="submit" disabled={$delayed}>
						{#if $delayed}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
							Creating...
						{:else}
							Create Organization
						{/if}
					</Button>
					<Button variant="outline" href="/admin/organizations" disabled={$delayed}>Cancel</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
