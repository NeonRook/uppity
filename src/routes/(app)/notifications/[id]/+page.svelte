<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import {
		CircleAlert,
		ArrowLeft,
		LoaderCircle,
		Mail,
		MessageSquare,
		Webhook,
		Trash2
	} from '@lucide/svelte';

	let { data, form } = $props();

	let loading = $state(false);
	let showDeleteDialog = $state(false);

	const config = $derived(data.channel.config as Record<string, unknown>);
	const type = $derived(data.channel.type);
	const TypeIcon = $derived(getIcon(type));
	let method = $state(untrack(() => (config.method as string) || 'POST'));

	function getChannelTypeName(t: string): string {
		switch (t) {
			case 'email':
				return 'Email';
			case 'slack':
				return 'Slack';
			case 'discord':
				return 'Discord';
			case 'webhook':
				return 'Webhook';
			default:
				return t;
		}
	}

	function getIcon(t: string) {
		switch (t) {
			case 'email':
				return Mail;
			case 'slack':
			case 'discord':
				return MessageSquare;
			case 'webhook':
				return Webhook;
			default:
				return Mail;
		}
	}

	const httpMethods = ['POST', 'PUT', 'PATCH'];
</script>

<svelte:head>
	<title>Edit {data.channel.name} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/notifications">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<div class="flex items-center gap-2">
				<h1 class="text-3xl font-bold tracking-tight">{data.channel.name}</h1>
				<Badge variant="secondary">{getChannelTypeName(type)}</Badge>
			</div>
			<p class="text-muted-foreground">Edit notification channel settings</p>
		</div>
		<Button variant="destructive" size="icon" onclick={() => (showDeleteDialog = true)}>
			<Trash2 class="h-4 w-4" />
		</Button>
	</div>

	<form
		method="POST"
		action="?/update"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
	>
		{#if form?.error}
			<Alert variant="destructive" class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{form.error}</AlertDescription>
			</Alert>
		{/if}

		<input type="hidden" name="type" value={type} />

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
						placeholder="My Notification Channel"
						value={data.channel.name}
						required
						disabled={loading}
					/>
				</Field.Field>

				<Field.Field>
					<Field.Label>Channel Type</Field.Label>
					<div class="flex items-center gap-3 rounded-lg border p-4">
						<TypeIcon class="h-5 w-5 shrink-0" />
						<div>
							<div class="font-medium">{getChannelTypeName(type)}</div>
							<Field.Description>
								Channel type cannot be changed. Create a new channel instead.
							</Field.Description>
						</div>
					</div>
				</Field.Field>
			</Card.Content>
		</Card.Root>

		{#if type === 'email'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Email Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="email">Email Address *</Field.Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="alerts@example.com"
							value={(config.email as string) || ''}
							required
							disabled={loading}
						/>
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{:else if type === 'slack'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Slack Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="webhookUrl">Webhook URL *</Field.Label>
						<Input
							id="webhookUrl"
							name="webhookUrl"
							type="url"
							placeholder="https://hooks.slack.com/services/..."
							value={(config.webhookUrl as string) || ''}
							required
							disabled={loading}
						/>
					</Field.Field>

					<Field.Field>
						<Field.Label for="channel">Channel (optional)</Field.Label>
						<Input
							id="channel"
							name="channel"
							placeholder="general"
							value={(config.channel as string) || ''}
							disabled={loading}
						/>
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{:else if type === 'discord'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Discord Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="discordWebhookUrl">Webhook URL *</Field.Label>
						<Input
							id="discordWebhookUrl"
							name="discordWebhookUrl"
							type="url"
							placeholder="https://discord.com/api/webhooks/..."
							value={(config.discordWebhookUrl as string) || ''}
							required
							disabled={loading}
						/>
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{:else if type === 'webhook'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Webhook Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="url">URL *</Field.Label>
						<Input
							id="url"
							name="url"
							type="url"
							placeholder="https://api.example.com/webhooks/alerts"
							value={(config.url as string) || ''}
							required
							disabled={loading}
						/>
					</Field.Field>

					<Field.Field>
						<Field.Label for="method">HTTP Method</Field.Label>
						<Select.Root
							type="single"
							name="method"
							value={method}
							onValueChange={(v) => (method = v)}
						>
							<Select.Trigger class="w-full">
								{method}
							</Select.Trigger>
							<Select.Content>
								{#each httpMethods as m (m)}
									<Select.Item value={m}>{m}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="method" value={method} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="headers">Custom Headers (JSON)</Field.Label>
						<Textarea
							id="headers"
							name="headers"
							placeholder={'{\n  "Authorization": "Bearer token",\n  "X-Custom-Header": "value"\n}'}
							value={config.headers ? JSON.stringify(config.headers, null, 2) : ''}
							class="font-mono text-sm"
							disabled={loading}
						/>
					</Field.Field>

					<Field.Field>
						<Field.Label for="bodyTemplate">Custom Body Template (JSON)</Field.Label>
						<Textarea
							id="bodyTemplate"
							name="bodyTemplate"
							placeholder={'{\n  "message": "{{monitor.name}} is {{status}}",\n  "timestamp": "{{timestamp}}"\n}'}
							value={(config.bodyTemplate as string) || ''}
							class="font-mono text-sm"
							disabled={loading}
						/>
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{/if}

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/notifications" disabled={loading}>Cancel</Button>
			<Button type="submit" disabled={loading}>
				{#if loading}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					Saving...
				{:else}
					Save Changes
				{/if}
			</Button>
		</div>
	</form>
</div>

<DeleteDialog
	open={showDeleteDialog}
	onOpenChange={(open) => (showDeleteDialog = open)}
	title="Delete notification channel?"
	description="This will permanently delete &quot;{data.channel
		.name}&quot;. You will no longer receive alerts through this channel."
/>
