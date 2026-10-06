<script lang="ts">
	import { Bell, Pencil, Trash2 } from "@lucide/svelte";
	import { toast } from "svelte-sonner";

	import AddButton from "#lib/components/add-button.svelte";
	import DeleteDialog from "#lib/components/delete-dialog.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import * as Tooltip from "#lib/components/ui/tooltip/index.js";
	import {
		CHANNEL_TYPE_KEYS,
		getAvailableChannelTypes,
		getChannelType,
	} from "#lib/notifications.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getChannels, toggleChannel, deleteChannel } from "#lib/remote/notifications.remote.js";
	import type { NotificationChannel } from "#lib/server/db/schema.js";

	let { data } = $props();
	const channelsQuery = getChannels();

	// Prefer query data (after refresh/mutation), fallback to preloaded data
	const channels = $derived(channelsQuery.current ?? data.channels);

	// Usage limits from parent layout (self-hosted has all features)
	const usageLimits = $derived(data.usageLimits);
	const availableChannelTypes = $derived(
		getAvailableChannelTypes(data.selfHosted, usageLimits?.features.notificationChannels),
	);
	const hasAllChannelTypes = $derived(availableChannelTypes.length === CHANNEL_TYPE_KEYS.length);

	let deleteChannelId = $state<string | null>(null);
	let togglingChannelId = $state<string | null>(null);

	function getChannelDescription(channel: NotificationChannel): string {
		const config = channel.config as Record<string, unknown>;
		switch (channel.type) {
			case "email":
				return (config.email as string) || m.notifications_no_email();
			case "slack":
				return config.channel ? `#${config.channel}` : m.notifications_slack_webhook();
			case "discord":
				return m.notifications_discord_webhook();
			case "webhook":
				return (config.url as string) || m.notifications_no_url();
			default:
				return "";
		}
	}

	async function handleToggle(channelId: string, currentEnabled: boolean) {
		togglingChannelId = channelId;
		try {
			await toggleChannel({ channelId }).updates(
				getChannels().withOverride((prev) =>
					prev.map((ch) => (ch.id === channelId ? { ...ch, enabled: !currentEnabled } : ch)),
				),
			);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to toggle channel");
		} finally {
			togglingChannelId = null;
		}
	}

	async function handleDelete(channelId: string) {
		await deleteChannel({ channelId }).updates(
			getChannels().withOverride((prev) => prev.filter((ch) => ch.id !== channelId)),
		);
	}
</script>

<svelte:head>
	<title>{m.notifications_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.notifications_title()}</h1>
			<p class="text-muted-foreground">{m.notifications_subtitle()}</p>
		</div>
		<div class="flex items-center gap-2">
			{#if !hasAllChannelTypes}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Badge variant="outline" class="hidden text-xs font-normal sm:inline-flex">
							{availableChannelTypes.join(", ")} only
						</Badge>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>Upgrade to unlock all notification types</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
			<AddButton href="/notifications/new" text={m.notifications_add()} />
		</div>
	</div>

	{#if channelsQuery.error}
		<Card.Root>
			<Card.Content class="p-6">
				<p class="text-destructive">Failed to load channels: {channelsQuery.error.message}</p>
			</Card.Content>
		</Card.Root>
	{:else if channels.length === 0}
		<EmptyState
			icon={Bell}
			title={m.notifications_empty_title()}
			description={m.notifications_empty_desc()}
			buttonText={m.notifications_add()}
			buttonHref="/notifications/new"
		/>
	{:else}
		<div class="grid gap-4">
			{#each channels as channel (channel.id)}
				{@const Icon = getChannelType(channel.type).icon}
				<Card.Root>
					<Card.Content class="p-4 sm:p-6">
						<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<div class="flex items-center gap-4">
								<div
									class="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
								>
									<Icon class="h-5 w-5" />
								</div>
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<h3 class="font-semibold">{channel.name}</h3>
										<Badge variant="secondary">{getChannelType(channel.type).label()}</Badge>
										{#if !channel.enabled}
											<Badge variant="outline">{m.common_disabled()}</Badge>
										{/if}
									</div>
									<p class="text-muted-foreground truncate text-sm">
										{getChannelDescription(channel)}
									</p>
								</div>
							</div>

							<div class="flex items-center gap-2">
								<Switch
									checked={channel.enabled}
									disabled={togglingChannelId === channel.id}
									onCheckedChange={() => handleToggle(channel.id, channel.enabled)}
								/>

								<Button variant="ghost" size="icon" href="/notifications/{channel.id}">
									<Pencil class="h-4 w-4" />
								</Button>

								<Button variant="ghost" size="icon" onclick={() => (deleteChannelId = channel.id)}>
									<Trash2 class="h-4 w-4" />
								</Button>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<DeleteDialog
	itemId={deleteChannelId}
	onOpenChange={() => (deleteChannelId = null)}
	onDelete={handleDelete}
	title={m.notifications_delete_title()}
	description={m.notifications_delete_desc()}
/>
