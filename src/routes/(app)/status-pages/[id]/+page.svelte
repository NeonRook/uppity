<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		CircleAlert,
		ArrowLeft,
		LoaderCircle,
		Plus,
		Trash2,
		ExternalLink,
		GripVertical
	} from '@lucide/svelte';
	import type { StatusPage, StatusPageGroup, Monitor } from '$lib/server/db/schema';

	interface Props {
		data: {
			statusPage: StatusPage;
			allMonitors: Monitor[];
			selectedMonitorIds: string[];
			groups: StatusPageGroup[];
			pageMonitors: Array<{
				pageMonitor: { id: string; monitorId: string; groupId: string | null };
				monitor: { id: string; name: string; type: string; url: string | null };
			}>;
		};
		form: {
			error?: string;
			success?: boolean;
		} | null;
	}

	let { data, form }: Props = $props();

	let loading = $state(false);
	let showDeleteDialog = $state(false);
	let deleting = $state(false);
	let newGroupName = $state('');

	let isPublic = $state(untrack(() => data.statusPage.isPublic));

	const availableMonitors = $derived(
		data.allMonitors.filter((m) => !data.selectedMonitorIds.includes(m.id))
	);

	function getStatusPageUrl(): string {
		if (data.statusPage.customDomain) {
			return `https://${data.statusPage.customDomain}`;
		}
		return `/status/${data.statusPage.slug}`;
	}
</script>

<svelte:head>
	<title>Edit {data.statusPage.name} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/status-pages">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-3xl font-bold tracking-tight">{data.statusPage.name}</h1>
			<p class="text-muted-foreground">Edit status page settings</p>
		</div>
		<Button variant="outline" href={getStatusPageUrl()} target="_blank">
			<ExternalLink class="mr-2 h-4 w-4" />
			View Page
		</Button>
		<Button variant="destructive" onclick={() => (showDeleteDialog = true)}>
			<Trash2 class="mr-2 h-4 w-4" />
			Delete
		</Button>
	</div>

	{#if form?.error}
		<Alert variant="destructive">
			<CircleAlert class="h-4 w-4" />
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	{#if form?.success}
		<Alert>
			<AlertDescription>Status page updated successfully.</AlertDescription>
		</Alert>
	{/if}

	<Tabs.Root value="settings">
		<Tabs.List>
			<Tabs.Trigger value="settings">Settings</Tabs.Trigger>
			<Tabs.Trigger value="monitors">Monitors</Tabs.Trigger>
			<Tabs.Trigger value="groups">Groups</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="settings" class="mt-6">
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
								value={data.statusPage.name}
								required
								disabled={loading}
							/>
						</div>

						<div class="space-y-2">
							<Label for="slug">URL Slug *</Label>
							<div class="flex items-center gap-2">
								<span class="text-sm text-muted-foreground">/status/</span>
								<Input
									id="slug"
									name="slug"
									value={data.statusPage.slug}
									required
									disabled={loading}
									class="flex-1"
								/>
							</div>
						</div>

						<div class="space-y-2">
							<Label for="description">Description</Label>
							<Textarea
								id="description"
								name="description"
								value={data.statusPage.description || ''}
								disabled={loading}
							/>
						</div>

						<div class="flex items-center justify-between">
							<div class="space-y-0.5">
								<Label>Public</Label>
								<p class="text-sm text-muted-foreground">
									Make this status page publicly accessible
								</p>
							</div>
							<Switch bind:checked={isPublic} />
							<input type="hidden" name="isPublic" value={isPublic.toString()} />
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root class="mt-6">
					<Card.Header>
						<Card.Title>Branding</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="space-y-2">
							<Label for="logoUrl">Logo URL</Label>
							<Input
								id="logoUrl"
								name="logoUrl"
								type="url"
								value={data.statusPage.logoUrl || ''}
								disabled={loading}
							/>
						</div>

						<div class="space-y-2">
							<Label for="primaryColor">Primary Color</Label>
							<div class="flex items-center gap-2">
								<input
									type="color"
									id="primaryColor"
									name="primaryColor"
									value={data.statusPage.primaryColor || '#000000'}
									class="h-10 w-10 cursor-pointer rounded border"
									disabled={loading}
								/>
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				<div class="mt-6 flex justify-end">
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
		</Tabs.Content>

		<Tabs.Content value="monitors" class="mt-6 space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>Active Monitors</Card.Title>
					<Card.Description>Monitors currently displayed on this status page</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.pageMonitors.length === 0}
						<p class="py-4 text-center text-sm text-muted-foreground">
							No monitors added yet. Add monitors below.
						</p>
					{:else}
						<div class="space-y-2">
							{#each data.pageMonitors as pm (pm.pageMonitor.id)}
								<div class="flex items-center justify-between rounded-lg border p-3">
									<div class="flex items-center gap-3">
										<GripVertical class="h-4 w-4 text-muted-foreground" />
										<div>
											<div class="font-medium">{pm.monitor.name}</div>
											<div class="text-xs text-muted-foreground">
												{pm.monitor.type.toUpperCase()}
											</div>
										</div>
									</div>
									<form method="POST" action="?/removeMonitor" use:enhance>
										<input type="hidden" name="monitorId" value={pm.monitor.id} />
										<Button variant="ghost" size="icon" type="submit">
											<Trash2 class="h-4 w-4" />
										</Button>
									</form>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Available Monitors</Card.Title>
					<Card.Description>Add monitors to display on this status page</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if availableMonitors.length === 0}
						<p class="py-4 text-center text-sm text-muted-foreground">
							All monitors are already added to this status page.
						</p>
					{:else}
						<div class="space-y-2">
							{#each availableMonitors as monitor (monitor.id)}
								<div class="flex items-center justify-between rounded-lg border p-3">
									<div>
										<div class="font-medium">{monitor.name}</div>
										<div class="text-xs text-muted-foreground">
											{monitor.type.toUpperCase()} - {monitor.url ||
												`${monitor.hostname}:${monitor.port}`}
										</div>
									</div>
									<form method="POST" action="?/addMonitor" use:enhance>
										<input type="hidden" name="monitorId" value={monitor.id} />
										<Button variant="outline" size="sm" type="submit">
											<Plus class="mr-1 h-3 w-3" />
											Add
										</Button>
									</form>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="groups" class="mt-6 space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>Monitor Groups</Card.Title>
					<Card.Description>Organize monitors into groups on your status page</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.groups.length === 0}
						<p class="py-4 text-center text-sm text-muted-foreground">
							No groups created yet. Create a group to organize your monitors.
						</p>
					{:else}
						<div class="space-y-2">
							{#each data.groups as group (group.id)}
								<div class="flex items-center justify-between rounded-lg border p-3">
									<div class="flex items-center gap-3">
										<GripVertical class="h-4 w-4 text-muted-foreground" />
										<div>
											<div class="font-medium">{group.name}</div>
											{#if group.description}
												<div class="text-xs text-muted-foreground">
													{group.description}
												</div>
											{/if}
										</div>
									</div>
									<form method="POST" action="?/deleteGroup" use:enhance>
										<input type="hidden" name="groupId" value={group.id} />
										<Button variant="ghost" size="icon" type="submit">
											<Trash2 class="h-4 w-4" />
										</Button>
									</form>
								</div>
							{/each}
						</div>
					{/if}

					<form
						method="POST"
						action="?/createGroup"
						class="mt-4 flex gap-2"
						use:enhance={() => {
							return async ({ update }) => {
								newGroupName = '';
								await update();
							};
						}}
					>
						<Input
							name="groupName"
							placeholder="New group name"
							bind:value={newGroupName}
							class="flex-1"
						/>
						<Button type="submit" disabled={!newGroupName.trim()}>
							<Plus class="mr-1 h-4 w-4" />
							Add Group
						</Button>
					</form>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>

<AlertDialog.Root bind:open={showDeleteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete status page?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete "{data.statusPage.name}". The public URL will no longer be
				accessible.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
					};
				}}
			>
				<Button type="submit" variant="destructive" disabled={deleting}>
					{deleting ? 'Deleting...' : 'Delete'}
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
