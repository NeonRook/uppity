<script lang="ts">
	import ChannelsListSkeleton from '$lib/components/channels-list-skeleton.svelte';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Switch } from '$lib/components/ui/switch';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages.js';
	import { getChannels, toggleChannel, deleteChannel } from '$lib/remote/notifications.remote';
	import type { NotificationChannel } from '$lib/server/db/schema';
	import { Bell, Mail, MessageSquare, Pencil, Plus, Trash2, Webhook } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	const channelsQuery = getChannels();

	// Prefer query data (after refresh/mutation), fallback to preloaded data
	const channels = $derived(channelsQuery.current ?? data.channels);

	// Usage limits from parent layout
	const usageLimits = $derived(data.usageLimits);
	const availableChannelTypes = $derived(
		usageLimits?.features.notificationChannels ?? ['email', 'slack', 'discord', 'webhook']
	);
	const hasAllChannelTypes = $derived(availableChannelTypes.length >= 4);

	let deleteChannelId = $state<string | null>(null);
	let togglingChannelId = $state<string | null>(null);

	function getChannelIcon(type: string) {
		switch (type) {
			case 'email':
				return Mail;
			case 'slack':
				return MessageSquare;
			case 'discord':
				return MessageSquare;
			case 'webhook':
				return Webhook;
			default:
				return Bell;
		}
	}

	function getChannelTypeName(type: string): string {
		switch (type) {
			case 'email':
				return m.notifications_type_email();
			case 'slack':
				return m.notifications_type_slack();
			case 'discord':
				return m.notifications_type_discord();
			case 'webhook':
				return m.notifications_type_webhook();
			default:
				return type;
		}
	}

	function getChannelDescription(channel: NotificationChannel): string {
		const config = channel.config as Record<string, unknown>;
		switch (channel.type) {
			case 'email':
				return (config.email as string) || m.notifications_no_email();
			case 'slack':
				return config.channel ? `#${config.channel}` : m.notifications_slack_webhook();
			case 'discord':
				return m.notifications_discord_webhook();
			case 'webhook':
				return (config.url as string) || m.notifications_no_url();
			default:
				return '';
		}
	}

	async function handleToggle(channelId: string, currentEnabled: boolean) {
		togglingChannelId = channelId;
		try {
			await toggleChannel({ channelId }).updates(
				getChannels().withOverride((channels) =>
					channels.map((ch) => (ch.id === channelId ? { ...ch, enabled: !currentEnabled } : ch))
				)
			);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to toggle channel');
		} finally {
			togglingChannelId = null;
		}
	}

	async function handleDelete(channelId: string) {
		await deleteChannel({ channelId }).updates(
			getChannels().withOverride((channels) => channels.filter((ch) => ch.id !== channelId))
		);
	}
</script>

<svelte:head>
	<title>{m.notifications_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.notifications_title()}</h1>
			<p class="text-muted-foreground">{m.notifications_subtitle()}</p>
		</div>
		<div class="flex items-center gap-2">
			{#if !hasAllChannelTypes}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Badge variant="outline" class="text-xs font-normal">
							{availableChannelTypes.join(', ')} only
						</Badge>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>Upgrade to unlock all notification types</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
			<Button href="/notifications/new">
				<Plus class="mr-2 h-4 w-4" />
				{m.notifications_add()}
			</Button>
		</div>
	</div>

	{#if channelsQuery.loading && !channels}
		<ChannelsListSkeleton />
	{:else if channelsQuery.error}
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
				{@const Icon = getChannelIcon(channel.type)}
				<Card.Root>
					<Card.Content class="flex items-center justify-between p-6">
						<div class="flex items-center gap-4">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Icon class="h-5 w-5" />
							</div>
							<div>
								<div class="flex items-center gap-2">
									<h3 class="font-semibold">{channel.name}</h3>
									<Badge variant="secondary">{getChannelTypeName(channel.type)}</Badge>
									{#if !channel.enabled}
										<Badge variant="outline">{m.common_disabled()}</Badge>
									{/if}
								</div>
								<p class="text-sm text-muted-foreground">{getChannelDescription(channel)}</p>
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
