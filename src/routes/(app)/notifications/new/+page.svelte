<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Field from '$lib/components/ui/field';
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
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const { form, errors, enhance, delayed, message } = superForm(untrack(() => data.form));

	function getChannelTypeLabel(type: string): string {
		switch (type) {
			case 'email':
				return m.notification_type_email();
			case 'slack':
				return m.notification_type_slack();
			case 'discord':
				return m.notification_type_discord();
			case 'webhook':
				return m.notification_type_webhook();
			default:
				return type;
		}
	}

	function getChannelTypeDesc(type: string): string {
		switch (type) {
			case 'email':
				return m.notification_email_desc();
			case 'slack':
				return m.notification_slack_desc();
			case 'discord':
				return m.notification_discord_desc();
			case 'webhook':
				return m.notification_webhook_desc();
			default:
				return '';
		}
	}

	const channelTypeValues = ['email', 'slack', 'discord', 'webhook'] as const;
	const channelTypeIcons = {
		email: Mail,
		slack: MessageSquare,
		discord: MessageSquare,
		webhook: Webhook
	};

	const httpMethods = ['POST', 'PUT', 'PATCH'] as const;
</script>

<svelte:head>
	<title>{m.notification_new_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/notifications">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.notification_new_title()}</h1>
			<p class="text-muted-foreground">{m.notification_new_subtitle()}</p>
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
				<Card.Title>{m.notification_basic_info()}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<Field.Field>
					<Field.Label for="name">{m.common_name()} *</Field.Label>
					<Input
						id="name"
						name="name"
						placeholder={m.notification_name_placeholder()}
						bind:value={$form.name}
						disabled={$delayed}
						aria-invalid={$errors.name ? 'true' : undefined}
					/>
					<Field.Error errors={$errors.name} />
				</Field.Field>

				<Field.Field>
					<Field.Label>{m.notification_channel_type()}</Field.Label>
					<div class="grid grid-cols-2 gap-3">
						{#each channelTypeValues as channelType (channelType)}
							{@const Icon = channelTypeIcons[channelType]}
							<button
								type="button"
								class="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted {$form.type ===
								channelType
									? 'border-primary bg-primary/5'
									: 'border-border'}"
								onclick={() => ($form.type = channelType)}
								disabled={$delayed}
							>
								<Icon class="h-5 w-5 shrink-0" />
								<div>
									<div class="font-medium">{getChannelTypeLabel(channelType)}</div>
									<div class="text-xs text-muted-foreground">{getChannelTypeDesc(channelType)}</div>
								</div>
							</button>
						{/each}
					</div>
					<input type="hidden" name="type" bind:value={$form.type} />
				</Field.Field>
			</Card.Content>
		</Card.Root>

		{#if $form.type === 'email'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>{m.notification_email_config()}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="email">{m.notification_email_address()} *</Field.Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="alerts@example.com"
							bind:value={$form.email}
							disabled={$delayed}
							aria-invalid={$errors.email ? 'true' : undefined}
						/>
						<Field.Description>{m.notification_email_address_desc()}</Field.Description>
						<Field.Error errors={$errors.email} />
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{:else if $form.type === 'slack'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>{m.notification_slack_config()}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="webhookUrl">{m.notification_webhook_url()} *</Field.Label>
						<Input
							id="webhookUrl"
							name="webhookUrl"
							type="url"
							placeholder="https://hooks.slack.com/services/..."
							bind:value={$form.webhookUrl}
							disabled={$delayed}
							aria-invalid={$errors.webhookUrl ? 'true' : undefined}
						/>
						<Field.Description>
							{m.notification_slack_webhook_desc()}
						</Field.Description>
						<Field.Error errors={$errors.webhookUrl} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="channel">{m.notification_slack_channel()}</Field.Label>
						<Input
							id="channel"
							name="channel"
							placeholder="general"
							bind:value={$form.channel}
							disabled={$delayed}
						/>
						<Field.Description>
							{m.notification_slack_channel_desc()}
						</Field.Description>
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{:else if $form.type === 'discord'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>{m.notification_discord_config()}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="discordWebhookUrl">{m.notification_webhook_url()} *</Field.Label>
						<Input
							id="discordWebhookUrl"
							name="discordWebhookUrl"
							type="url"
							placeholder="https://discord.com/api/webhooks/..."
							bind:value={$form.discordWebhookUrl}
							disabled={$delayed}
							aria-invalid={$errors.discordWebhookUrl ? 'true' : undefined}
						/>
						<Field.Description>
							{m.notification_discord_webhook_desc()}
						</Field.Description>
						<Field.Error errors={$errors.discordWebhookUrl} />
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{:else if $form.type === 'webhook'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>{m.notification_webhook_config()}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="url">{m.notification_webhook_endpoint()} *</Field.Label>
						<Input
							id="url"
							name="url"
							type="url"
							placeholder="https://api.example.com/webhooks/alerts"
							bind:value={$form.url}
							disabled={$delayed}
							aria-invalid={$errors.url ? 'true' : undefined}
						/>
						<Field.Error errors={$errors.url} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="method">{m.notification_http_method()}</Field.Label>
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
								{#each httpMethods as method (method)}
									<Select.Item value={method}>{method}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="method" bind:value={$form.method} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="headers">{m.notification_custom_headers()}</Field.Label>
						<Textarea
							id="headers"
							name="headers"
							placeholder={'{\n  "Authorization": "Bearer token",\n  "X-Custom-Header": "value"\n}'}
							class="font-mono text-sm"
							bind:value={$form.headers}
							disabled={$delayed}
						/>
						<Field.Description>{m.notification_headers_desc()}</Field.Description>
					</Field.Field>

					<Field.Field>
						<Field.Label for="bodyTemplate">{m.notification_body_template()}</Field.Label>
						<Textarea
							id="bodyTemplate"
							name="bodyTemplate"
							placeholder={'{\n  "message": "{{monitor.name}} is {{status}}",\n  "timestamp": "{{timestamp}}"\n}'}
							class="font-mono text-sm"
							bind:value={$form.bodyTemplate}
							disabled={$delayed}
						/>
						<Field.Description>
							{m.notification_body_template_desc()}
						</Field.Description>
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{/if}

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/notifications" disabled={$delayed}
				>{m.common_cancel()}</Button
			>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{m.notification_creating()}
				{:else}
					{m.notification_create()}
				{/if}
			</Button>
		</div>
	</form>
</div>
