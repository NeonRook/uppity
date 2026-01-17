<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { NotificationChannelForm } from '$lib/schemas/notification-channel';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		CircleAlert,
		ArrowLeft,
		LoaderCircle,
		Mail,
		MessageSquare,
		Webhook
	} from '@lucide/svelte';

	interface Props {
		data: {
			form: SuperValidated<NotificationChannelForm>;
		};
	}

	let { data }: Props = $props();

	const { form, errors, enhance, delayed, message } = superForm(untrack(() => data.form));

	const channelTypes = [
		{ value: 'email', label: 'Email', icon: Mail, description: 'Send alerts via email' },
		{
			value: 'slack',
			label: 'Slack',
			icon: MessageSquare,
			description: 'Post to a Slack channel via webhook'
		},
		{
			value: 'discord',
			label: 'Discord',
			icon: MessageSquare,
			description: 'Post to a Discord channel via webhook'
		},
		{
			value: 'webhook',
			label: 'Webhook',
			icon: Webhook,
			description: 'Send to a custom HTTP endpoint'
		}
	] as const;

	const httpMethods = ['POST', 'PUT', 'PATCH'] as const;
</script>

<svelte:head>
	<title>New Notification Channel - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/notifications">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">New Notification Channel</h1>
			<p class="text-muted-foreground">Configure where to receive alerts</p>
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
						placeholder="My Notification Channel"
						bind:value={$form.name}
						disabled={$delayed}
						aria-invalid={$errors.name ? 'true' : undefined}
					/>
					{#if $errors.name}
						<p class="text-sm text-destructive">{$errors.name}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label>Channel Type</Label>
					<div class="grid grid-cols-2 gap-3">
						{#each channelTypes as channelType (channelType.value)}
							{@const Icon = channelType.icon}
							<button
								type="button"
								class="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted {$form.type ===
								channelType.value
									? 'border-primary bg-primary/5'
									: 'border-border'}"
								onclick={() => ($form.type = channelType.value)}
								disabled={$delayed}
							>
								<Icon class="h-5 w-5 shrink-0" />
								<div>
									<div class="font-medium">{channelType.label}</div>
									<div class="text-xs text-muted-foreground">{channelType.description}</div>
								</div>
							</button>
						{/each}
					</div>
					<input type="hidden" name="type" bind:value={$form.type} />
				</div>
			</Card.Content>
		</Card.Root>

		{#if $form.type === 'email'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Email Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="email">Email Address *</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="alerts@example.com"
							bind:value={$form.email}
							disabled={$delayed}
							aria-invalid={$errors.email ? 'true' : undefined}
						/>
						{#if $errors.email}
							<p class="text-sm text-destructive">{$errors.email}</p>
						{/if}
						<p class="text-xs text-muted-foreground">Alerts will be sent to this email address.</p>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if $form.type === 'slack'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Slack Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="webhookUrl">Webhook URL *</Label>
						<Input
							id="webhookUrl"
							name="webhookUrl"
							type="url"
							placeholder="https://hooks.slack.com/services/..."
							bind:value={$form.webhookUrl}
							disabled={$delayed}
							aria-invalid={$errors.webhookUrl ? 'true' : undefined}
						/>
						{#if $errors.webhookUrl}
							<p class="text-sm text-destructive">{$errors.webhookUrl}</p>
						{/if}
						<p class="text-xs text-muted-foreground">
							Create an incoming webhook in your Slack workspace settings.
						</p>
					</div>

					<div class="space-y-2">
						<Label for="channel">Channel (optional)</Label>
						<Input
							id="channel"
							name="channel"
							placeholder="general"
							bind:value={$form.channel}
							disabled={$delayed}
						/>
						<p class="text-xs text-muted-foreground">
							Override the default channel. Don't include the # symbol.
						</p>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if $form.type === 'discord'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Discord Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="discordWebhookUrl">Webhook URL *</Label>
						<Input
							id="discordWebhookUrl"
							name="discordWebhookUrl"
							type="url"
							placeholder="https://discord.com/api/webhooks/..."
							bind:value={$form.discordWebhookUrl}
							disabled={$delayed}
							aria-invalid={$errors.discordWebhookUrl ? 'true' : undefined}
						/>
						{#if $errors.discordWebhookUrl}
							<p class="text-sm text-destructive">{$errors.discordWebhookUrl}</p>
						{/if}
						<p class="text-xs text-muted-foreground">
							Create a webhook in your Discord channel settings (Edit Channel → Integrations →
							Webhooks).
						</p>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if $form.type === 'webhook'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Webhook Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="url">URL *</Label>
						<Input
							id="url"
							name="url"
							type="url"
							placeholder="https://api.example.com/webhooks/alerts"
							bind:value={$form.url}
							disabled={$delayed}
							aria-invalid={$errors.url ? 'true' : undefined}
						/>
						{#if $errors.url}
							<p class="text-sm text-destructive">{$errors.url}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="method">HTTP Method</Label>
						<Select.Root
							type="single"
							name="method"
							value={$form.method}
							onValueChange={(v) => ($form.method = v as 'POST' | 'PUT' | 'PATCH')}
						>
							<Select.Trigger class="w-full">
								{$form.method ?? 'POST'}
							</Select.Trigger>
							<Select.Content>
								{#each httpMethods as m (m)}
									<Select.Item value={m}>{m}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="method" bind:value={$form.method} />
					</div>

					<div class="space-y-2">
						<Label for="headers">Custom Headers (JSON)</Label>
						<Textarea
							id="headers"
							name="headers"
							placeholder={'{\n  "Authorization": "Bearer token",\n  "X-Custom-Header": "value"\n}'}
							class="font-mono text-sm"
							bind:value={$form.headers}
							disabled={$delayed}
						/>
						<p class="text-xs text-muted-foreground">Optional. Must be valid JSON.</p>
					</div>

					<div class="space-y-2">
						<Label for="bodyTemplate">Custom Body Template (JSON)</Label>
						<Textarea
							id="bodyTemplate"
							name="bodyTemplate"
							placeholder={'{\n  "message": "{{monitor.name}} is {{status}}",\n  "timestamp": "{{timestamp}}"\n}'}
							class="font-mono text-sm"
							bind:value={$form.bodyTemplate}
							disabled={$delayed}
						/>
						<p class="text-xs text-muted-foreground">
							Optional. Use placeholders like {'{{monitor.name}}'}, {'{{status}}'}, {'{{timestamp}}'},
							{'{{errorMessage}}'}.
						</p>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/notifications" disabled={$delayed}>Cancel</Button>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					Creating...
				{:else}
					Create Channel
				{/if}
			</Button>
		</div>
	</form>
</div>
