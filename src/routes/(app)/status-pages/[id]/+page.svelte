<script lang="ts">
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import {
		CircleAlert,
		LoaderCircle,
		Plus,
		Trash2,
		ExternalLink,
		GripVertical,
		CircleCheck,
	} from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import DeleteDialog from "#lib/components/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import StatusPageFields from "#lib/components/status-page-fields.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as Tabs from "#lib/components/ui/tabs/index.js";
	import { deleteStatusPage } from "#lib/remote/status-pages.remote.js";
	import { getStatusPageUrl } from "#lib/status-page.js";

	let { data } = $props();

	const updateSuperform = superForm(
		untrack(() => data.updateForm),
		{
			resetForm: false,
		},
	);
	const {
		message: updateMessage,
		enhance: updateEnhance,
		delayed: updateDelayed,
	} = updateSuperform;

	let showDeleteDialog = $state(false);

	async function handleDelete() {
		await deleteStatusPage({ statusPageId: data.statusPage.id });
		goto(resolve("status-pages"));
	}
	let newGroupName = $state("");

	const availableMonitors = $derived(
		data.allMonitors.filter((m) => !data.selectedMonitorIds.includes(m.id)),
	);
</script>

<svelte:head>
	<title>Edit {data.statusPage.name} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader
		backHref="/status-pages"
		title={data.statusPage.name}
		description="Edit status page settings"
	>
		{#snippet actions()}
			<Button variant="outline" href={getStatusPageUrl(data.statusPage)} target="_blank"
				><ExternalLink class="mr-2 h-4 w-4" />View Page</Button
			>

			<Button variant="destructive" onclick={() => (showDeleteDialog = true)}
				><Trash2 class="mr-2 h-4 w-4" />Delete</Button
			>
		{/snippet}
	</PageHeader>

	{#if $updateMessage}
		<Alert
			variant={$updateMessage.includes("error") || $updateMessage.includes("taken")
				? "destructive"
				: "default"}
		>
			{#if $updateMessage.includes("error") || $updateMessage.includes("taken")}
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
				<StatusPageFields superform={updateSuperform} />

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
						<p class="text-muted-foreground py-4 text-center text-sm">
							No monitors added yet. Add monitors below.
						</p>
					{:else}
						<div class="space-y-2">
							{#each data.pageMonitors as pm (pm.pageMonitor.id)}
								<div class="flex items-center justify-between rounded-lg border p-3">
									<div class="flex items-center gap-3">
										<GripVertical class="text-muted-foreground h-4 w-4" />
										<div>
											<div class="font-medium">{pm.monitor.name}</div>
											<div class="text-muted-foreground text-xs">
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
						<p class="text-muted-foreground py-4 text-center text-sm">
							All monitors are already added to this status page.
						</p>
					{:else}
						<div class="space-y-2">
							{#each availableMonitors as monitor (monitor.id)}
								<div class="flex items-center justify-between rounded-lg border p-3">
									<div>
										<div class="font-medium">{monitor.name}</div>
										<div class="text-muted-foreground text-xs">
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
						<p class="text-muted-foreground py-4 text-center text-sm">
							No groups created yet. Create a group to organize your monitors.
						</p>
					{:else}
						<div class="space-y-2">
							{#each data.groups as group (group.id)}
								<div class="flex items-center justify-between rounded-lg border p-3">
									<div class="flex items-center gap-3">
										<GripVertical class="text-muted-foreground h-4 w-4" />
										<div>
											<div class="font-medium">{group.name}</div>
											{#if group.description}
												<div class="text-muted-foreground text-xs">
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
								newGroupName = "";
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

<DeleteDialog
	open={showDeleteDialog}
	itemId={data.statusPage.id}
	onOpenChange={(open) => (showDeleteDialog = open)}
	onDelete={handleDelete}
	title="Delete status page?"
	description="This will permanently delete &quot;{data.statusPage
		.name}&quot;. The public URL will no longer be accessible."
/>
