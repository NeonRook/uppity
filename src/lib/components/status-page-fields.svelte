<script lang="ts">
	import type { Infer, SuperForm } from "sveltekit-superforms";

	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { generateSlug } from "#lib/format.js";
	import type { updateStatusPageSchema } from "#lib/schemas/status-page.js";

	interface Props {
		superform: SuperForm<Infer<typeof updateStatusPageSchema>>;
		/** Derive the slug from the name as it is typed. */
		autoSlug?: boolean;
	}

	let { superform, autoSlug = false }: Props = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, delayed } = superform;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Basic Information</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		<Field.Field>
			<Field.Label for="name">Name *</Field.Label>
			<Input
				id="name"
				name="name"
				placeholder="My Status Page"
				bind:value={$form.name}
				oninput={autoSlug ? (e) => ($form.slug = generateSlug(e.currentTarget.value)) : undefined}
				required
				disabled={$delayed}
				aria-invalid={$errors.name ? "true" : undefined}
			/>
			<Field.Error errors={$errors.name} />
		</Field.Field>

		<Field.Field>
			<Field.Label for="slug">URL Slug *</Field.Label>
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground text-sm">/status/</span>
				<Input
					id="slug"
					name="slug"
					placeholder="my-status-page"
					bind:value={$form.slug}
					required
					disabled={$delayed}
					class="flex-1"
					aria-invalid={$errors.slug ? "true" : undefined}
				/>
			</div>
			<Field.Description>Only lowercase letters, numbers, and hyphens allowed.</Field.Description>
			<Field.Error errors={$errors.slug} />
		</Field.Field>

		<Field.Field>
			<Field.Label for="description">Description</Field.Label>
			<Textarea
				id="description"
				name="description"
				placeholder="Status updates for our services"
				bind:value={$form.description}
				disabled={$delayed}
				aria-invalid={$errors.description ? "true" : undefined}
			/>
			<Field.Error errors={$errors.description} />
		</Field.Field>

		<Field.Field orientation="horizontal">
			<Field.Label>Public</Field.Label>
			<Field.Description>Make this status page publicly accessible</Field.Description>
			<Switch checked={$form.isPublic} onCheckedChange={(checked) => ($form.isPublic = checked)} />
			<input type="hidden" name="isPublic" value={String($form.isPublic)} />
		</Field.Field>
	</Card.Content>
</Card.Root>

<Card.Root class="mt-6">
	<Card.Header>
		<Card.Title>Branding</Card.Title>
		<Card.Description>Customize the appearance of your status page</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<Field.Field>
			<Field.Label for="logoUrl">Logo URL</Field.Label>
			<Input
				id="logoUrl"
				name="logoUrl"
				type="url"
				placeholder="https://example.com/logo.png"
				bind:value={$form.logoUrl}
				disabled={$delayed}
				aria-invalid={$errors.logoUrl ? "true" : undefined}
			/>
			<Field.Error errors={$errors.logoUrl} />
		</Field.Field>

		<Field.Field>
			<Field.Label for="primaryColor">Primary Color</Field.Label>
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
			<Field.Error errors={$errors.primaryColor} />
		</Field.Field>
	</Card.Content>
</Card.Root>
