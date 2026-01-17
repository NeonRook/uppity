<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Plus, Bell, Mail, MessageSquare, Webhook, Pencil, Trash2 } from '@lucide/svelte';
	import type { NotificationChannel } from '$lib/server/db/schema';

	let { data } = $props();

	let deleteChannelId = $state<string | null>(null);
	let deleting = $state(false);

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
				return 'Email';
			case 'slack':
				return 'Slack';
			case 'discord':
				return 'Discord';
			case 'webhook':
				return 'Webhook';
			default:
				return type;
		}
	}

	function getChannelDescription(channel: NotificationChannel): string {
		const config = channel.config as Record<string, unknown>;
		switch (channel.type) {
			case 'email':
				return (config.email as string) || 'No email configured';
			case 'slack':
				return config.channel ? `#${config.channel}` : 'Slack Webhook';
			case 'discord':
				return 'Discord Webhook';
			case 'webhook':
				return (config.url as string) || 'No URL configured';
			default:
				return '';
		}
	}
</script>

<svelte:head>
	<title>Notifications - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Notification Channels</h1>
			<p class="text-muted-foreground">Configure where to receive alerts</p>
		</div>
		<Button href="/notifications/new">
			<Plus class="mr-2 h-4 w-4" />
			Add Channel
		</Button>
	</div>

	{#if data.channels.length === 0}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<Bell class="h-12 w-12 text-muted-foreground/50" />
					<h3 class="mt-4 text-lg font-semibold">No notification channels</h3>
					<p class="mt-2 mb-4 text-sm text-muted-foreground">
						Add notification channels to receive alerts when monitors go down.
					</p>
					<Button href="/notifications/new">
						<Plus class="mr-2 h-4 w-4" />
						Add Channel
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4">
			{#each data.channels as channel (channel.id)}
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
										<Badge variant="outline">Disabled</Badge>
									{/if}
								</div>
								<p class="text-sm text-muted-foreground">{getChannelDescription(channel)}</p>
							</div>
						</div>

						<div class="flex items-center gap-2">
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="channelId" value={channel.id} />
								<Switch checked={channel.enabled} type="submit" />
							</form>

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

<AlertDialog.Root
	open={deleteChannelId !== null}
	onOpenChange={(open) => !open && (deleteChannelId = null)}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete notification channel?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete this notification channel. You will no longer receive alerts
				through this channel.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (deleteChannelId = null)}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
						deleteChannelId = null;
					};
				}}
			>
				<input type="hidden" name="channelId" value={deleteChannelId} />
				<Button type="submit" variant="destructive" disabled={deleting}>
					{deleting ? 'Deleting...' : 'Delete'}
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
