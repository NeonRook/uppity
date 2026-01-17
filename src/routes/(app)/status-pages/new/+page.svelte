<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, ArrowLeft, LoaderCircle } from '@lucide/svelte';
	import { generateSlug } from '$lib/format';

	let { data } = $props();

	const { form, errors, message, enhance, delayed } = superForm(untrack(() => data.form));

	let selectedMonitors = new SvelteSet<string>();

	function handleNameChange(e: Event) {
		const target = e.target as HTMLInputElement;
		$form.name = target.value;
		$form.slug = generateSlug(target.value);
	}

	function toggleMonitor(id: string) {
		if (selectedMonitors.has(id)) {
			selectedMonitors.delete(id);
		} else {
			selectedMonitors.add(id);
		}
		$form.monitors = Array.from(selectedMonitors);
	}
</script>

<svelte:head>
	<title>New Status Page - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/status-pages">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">New Status Page</h1>
			<p class="text-muted-foreground">Create a public status page for your users</p>
		</div>
	</div>

	<form method="POST" use:enhance>
		{#if $message}
			<Alert variant="destructive" class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{$message}</AlertDescription>
			</Alert>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>Basic Information</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Name *</Label>
					<Input
						id="name"
						name="name"
						placeholder="My Status Page"
						bind:value={$form.name}
						oninput={handleNameChange}
						required
						disabled={$delayed}
						aria-invalid={$errors.name ? 'true' : undefined}
					/>
					{#if $errors.name}
						<p class="text-sm text-destructive">{$errors.name}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="slug">URL Slug *</Label>
					<div class="flex items-center gap-2">
						<span class="text-sm text-muted-foreground">/status/</span>
						<Input
							id="slug"
							name="slug"
							placeholder="my-status-page"
							bind:value={$form.slug}
							required
							disabled={$delayed}
							class="flex-1"
							aria-invalid={$errors.slug ? 'true' : undefined}
						/>
					</div>
					<p class="text-xs text-muted-foreground">
						Only lowercase letters, numbers, and hyphens allowed.
					</p>
					{#if $errors.slug}
						<p class="text-sm text-destructive">{$errors.slug}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="description">Description</Label>
					<Textarea
						id="description"
						name="description"
						placeholder="Status updates for our services"
						bind:value={$form.description}
						disabled={$delayed}
						aria-invalid={$errors.description ? 'true' : undefined}
					/>
					{#if $errors.description}
						<p class="text-sm text-destructive">{$errors.description}</p>
					{/if}
				</div>

				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label>Public</Label>
						<p class="text-sm text-muted-foreground">Make this status page publicly accessible</p>
					</div>
					<Switch
						checked={$form.isPublic}
						onCheckedChange={(checked) => ($form.isPublic = checked)}
					/>
					<input type="hidden" name="isPublic" value={String($form.isPublic)} />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>Branding</Card.Title>
				<Card.Description>Customize the appearance of your status page</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="logoUrl">Logo URL</Label>
					<Input
						id="logoUrl"
						name="logoUrl"
						type="url"
						placeholder="https://example.com/logo.png"
						bind:value={$form.logoUrl}
						disabled={$delayed}
						aria-invalid={$errors.logoUrl ? 'true' : undefined}
					/>
					{#if $errors.logoUrl}
						<p class="text-sm text-destructive">{$errors.logoUrl}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="primaryColor">Primary Color</Label>
					<div class="flex items-center gap-2">
						<input
							type="color"
							id="primaryColor"
							name="primaryColor"
							bind:value={$form.primaryColor}
							class="h-10 w-10 cursor-pointer rounded border"
							disabled={$delayed}
						/>
						<Input
							name="primaryColorHex"
							placeholder="#000000"
							bind:value={$form.primaryColor}
							disabled={$delayed}
							class="flex-1"
						/>
					</div>
					{#if $errors.primaryColor}
						<p class="text-sm text-destructive">{$errors.primaryColor}</p>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>Monitors</Card.Title>
				<Card.Description>Select which monitors to display on this status page</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.monitors.length === 0}
					<p class="py-4 text-center text-sm text-muted-foreground">
						No monitors available. Create monitors first to add them to your status page.
					</p>
				{:else}
					<div class="space-y-3">
						{#each data.monitors as monitor (monitor.id)}
							<label
								class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
							>
								<Checkbox
									checked={selectedMonitors.has(monitor.id)}
									onCheckedChange={() => toggleMonitor(monitor.id)}
								/>
								<input
									type="checkbox"
									name="monitors"
									value={monitor.id}
									checked={selectedMonitors.has(monitor.id)}
									class="hidden"
								/>
								<div class="flex-1">
									<div class="font-medium">{monitor.name}</div>
									<div class="text-xs text-muted-foreground">
										{monitor.type.toUpperCase()} - {monitor.url ||
											`${monitor.hostname}:${monitor.port}`}
									</div>
								</div>
							</label>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/status-pages" disabled={$delayed}>Cancel</Button>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					Creating...
				{:else}
					Create Status Page
				{/if}
			</Button>
		</div>
	</form>
</div>
