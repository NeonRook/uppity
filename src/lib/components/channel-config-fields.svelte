<script lang="ts">
	import type { Infer, SuperForm } from "sveltekit-superforms";

	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as Select from "#lib/components/ui/select/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { m } from "#lib/paraglide/messages.js";
	import type { notificationChannelSchema } from "#lib/schemas/notification-channel.js";

	interface Props {
		superform: SuperForm<Infer<typeof notificationChannelSchema>>;
	}

	let { superform }: Props = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, delayed } = superform;

	const httpMethods = ["POST", "PUT", "PATCH"] as const;
</script>

{#if $form.type === "email"}
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
					required
					disabled={$delayed}
					aria-invalid={$errors.email ? "true" : undefined}
				/>
				<Field.Description>{m.notification_email_address_desc()}</Field.Description>
				<Field.Error errors={$errors.email} />
			</Field.Field>
		</Card.Content>
	</Card.Root>
{:else if $form.type === "slack"}
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
					required
					disabled={$delayed}
					aria-invalid={$errors.webhookUrl ? "true" : undefined}
				/>
				<Field.Description>{m.notification_slack_webhook_desc()}</Field.Description>
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
				<Field.Description>{m.notification_slack_channel_desc()}</Field.Description>
			</Field.Field>
		</Card.Content>
	</Card.Root>
{:else if $form.type === "discord"}
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
					required
					disabled={$delayed}
					aria-invalid={$errors.discordWebhookUrl ? "true" : undefined}
				/>
				<Field.Description>{m.notification_discord_webhook_desc()}</Field.Description>
				<Field.Error errors={$errors.discordWebhookUrl} />
			</Field.Field>
		</Card.Content>
	</Card.Root>
{:else if $form.type === "webhook"}
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
					required
					disabled={$delayed}
					aria-invalid={$errors.url ? "true" : undefined}
				/>
				<Field.Error errors={$errors.url} />
			</Field.Field>

			<Field.Field>
				<Field.Label for="method">{m.notification_http_method()}</Field.Label>
				<Select.Root
					type="single"
					name="method"
					value={$form.method}
					onValueChange={(v) => ($form.method = v as "POST" | "PUT" | "PATCH")}
				>
					<Select.Trigger class="w-full">
						{$form.method ?? "POST"}
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
				<Field.Description>{m.notification_body_template_desc()}</Field.Description>
			</Field.Field>
		</Card.Content>
	</Card.Root>
{/if}
