<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
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
		GripVertical,
		CircleCheck
	} from '@lucide/svelte';

	let { data } = $props();

	const {
		form: updateForm,
		errors: updateErrors,
		message: updateMessage,
		enhance: updateEnhance,
		delayed: updateDelayed
	} = superForm(
		untrack(() => data.updateForm),
		{
			resetForm: false
		}
	);

	let showDeleteDialog = $state(false);
	let deleting = $state(false);
	let newGroupName = $state('');

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

	{#if $updateMessage}
		<Alert
			variant={$updateMessage.includes('error') || $updateMessage.includes('taken')
				? 'destructive'
				: 'default'}
		>
			{#if $updateMessage.includes('error') || $updateMessage.includes('taken')}
				<CircleAlert class="h-4 w-4" />
			{:else}
				<CircleCheck class="h-4 w-4" />
			{/if}
			<AlertDescription>{$updateMessage}</AlertDescription>
		</Alert>
	{/if}

	<Tabs.Root value="settings">
		<Tabs.List>
			<Tabs.Trigger value="settings">Settings</Tabs.Trigger>
			<Tabs.Trigger value="monitors">Monitors</Tabs.Trigger>
			<Tabs.Trigger value="groups">Groups</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="settings" class="mt-6">
			<form method="POST" action="?/update" use:updateEnhance>
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
								bind:value={$updateForm.name}
								required
								disabled={$updateDelayed}
								aria-invalid={$updateErrors.name ? 'true' : undefined}
							/>
							{#if $updateErrors.name}
								<p class="text-sm text-destructive">{$updateErrors.name}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="slug">URL Slug *</Label>
							<div class="flex items-center gap-2">
								<span class="text-sm text-muted-foreground">/status/</span>
								<Input
									id="slug"
									name="slug"
									bind:value={$updateForm.slug}
									required
									disabled={$updateDelayed}
									class="flex-1"
									aria-invalid={$updateErrors.slug ? 'true' : undefined}
								/>
							</div>
							{#if $updateErrors.slug}
								<p class="text-sm text-destructive">{$updateErrors.slug}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="description">Description</Label>
							<Textarea
								id="description"
								name="description"
								bind:value={$updateForm.description}
								disabled={$updateDelayed}
								aria-invalid={$updateErrors.description ? 'true' : undefined}
							/>
							{#if $updateErrors.description}
								<p class="text-sm text-destructive">{$updateErrors.description}</p>
							{/if}
						</div>

						<div class="flex items-center justify-between">
							<div class="space-y-0.5">
								<Label>Public</Label>
								<p class="text-sm text-muted-foreground">
									Make this status page publicly accessible
								</p>
							</div>
							<Switch
								checked={$updateForm.isPublic}
								onCheckedChange={(checked) => ($updateForm.isPublic = checked)}
							/>
							<input type="hidden" name="isPublic" value={String($updateForm.isPublic)} />
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
								bind:value={$updateForm.logoUrl}
								disabled={$updateDelayed}
								aria-invalid={$updateErrors.logoUrl ? 'true' : undefined}
							/>
							{#if $updateErrors.logoUrl}
								<p class="text-sm text-destructive">{$updateErrors.logoUrl}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="primaryColor">Primary Color</Label>
							<div class="flex items-center gap-2">
								<input
									type="color"
									id="primaryColor"
									name="primaryColor"
									bind:value={$updateForm.primaryColor}
									class="h-10 w-10 cursor-pointer rounded border"
									disabled={$updateDelayed}
								/>
							</div>
							{#if $updateErrors.primaryColor}
								<p class="text-sm text-destructive">{$updateErrors.primaryColor}</p>
							{/if}
						</div>
					</Card.Content>
				</Card.Root>

				<div class="mt-6 flex justify-end">
					<Button type="submit" disabled={$updateDelayed}>
						{#if $updateDelayed}
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
