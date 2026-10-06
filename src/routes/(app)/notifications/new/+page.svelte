<script lang="ts">
	import { CircleAlert, LoaderCircle, Lock } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import ChannelConfigFields from "#lib/components/channel-config-fields.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import {
		CHANNEL_TYPES,
		CHANNEL_TYPE_KEYS,
		getAvailableChannelTypes,
	} from "#lib/notifications.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const superform = superForm(untrack(() => data.form));
	const { form, errors, enhance, delayed, message } = superform;

	const availableChannelTypes = $derived(
		getAvailableChannelTypes(data.selfHosted, data.usageLimits?.features.notificationChannels),
	);
</script>

<svelte:head>
	<title>{m.notification_new_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader
		backHref="/notifications"
		title={m.notification_new_title()}
		description={m.notification_new_subtitle()}
	/>

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
						aria-invalid={$errors.name ? "true" : undefined}
					/>
					<Field.Error errors={$errors.name} />
				</Field.Field>

				<Field.Field>
					<Field.Label>{m.notification_channel_type()}</Field.Label>
					<div class="grid grid-cols-2 gap-3">
						{#each CHANNEL_TYPE_KEYS as channelType (channelType)}
							{@const Icon = CHANNEL_TYPES[channelType].icon}
							{@const available = availableChannelTypes.includes(channelType)}
							<button
								type="button"
								class="relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors {available
									? 'hover:bg-muted'
									: 'cursor-not-allowed opacity-60'} {$form.type === channelType && available
									? 'border-primary bg-primary/5'
									: 'border-border'}"
								onclick={() => available && ($form.type = channelType)}
								disabled={$delayed || !available}
							>
								<Icon class="h-5 w-5 shrink-0" />
								<div>
									<div class="flex items-center gap-2 font-medium">
										{CHANNEL_TYPES[channelType].label()}
										{#if !available}
											<Lock class="text-muted-foreground h-3 w-3" />
										{/if}
									</div>
									<div class="text-muted-foreground text-xs">
										{CHANNEL_TYPES[channelType].description()}
									</div>
								</div>
								{#if !available}
									<Badge variant="outline" class="absolute top-2 right-2 text-[10px]">Pro</Badge>
								{/if}
							</button>
						{/each}
					</div>
					<input type="hidden" name="type" bind:value={$form.type} />
				</Field.Field>
			</Card.Content>
		</Card.Root>

		<ChannelConfigFields {superform} />

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
