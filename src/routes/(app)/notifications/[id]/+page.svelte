<script lang="ts">
	import { enhance as enhanceForm } from "$app/forms";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { CircleAlert, LoaderCircle, Trash2 } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";
	import { superForm } from "sveltekit-superforms";

	import ChannelConfigFields from "#lib/components/channel-config-fields.svelte";
	import DeleteDialog from "#lib/components/delete-dialog.svelte";
	import MaintenanceMonitorPicker from "#lib/components/maintenance-monitor-picker.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { getChannelType } from "#lib/notifications.js";
	import { m } from "#lib/paraglide/messages.js";
	import { deleteChannel } from "#lib/remote/notifications.remote.js";

	let { data } = $props();

	const superform = superForm(
		untrack(() => data.form),
		{ resetForm: false },
	);
	const { form, errors, enhance, delayed, message } = superform;

	let showDeleteDialog = $state(false);
	let attachedMonitorIds = $state(untrack(() => data.attachedMonitorIds));
	let savingMonitors = $state(false);
	let savedMonitorIds = $state(untrack(() => data.attachedMonitorIds));
	const monitorsDirty = $derived(
		attachedMonitorIds.length !== savedMonitorIds.length ||
			attachedMonitorIds.some((id) => !savedMonitorIds.includes(id)),
	);

	async function handleDelete() {
		await deleteChannel({ channelId: data.channel.id });
		goto(resolve("notifications"));
	}

	const channelType = $derived(getChannelType(data.channel.type));
	const TypeIcon = $derived(channelType.icon);
</script>

<svelte:head>
	<title>{m.notification_edit_title()} - {data.channel.name} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader backHref="/notifications">
		<div class="flex items-center gap-2">
			<h1 class="text-3xl font-bold tracking-tight">{data.channel.name}</h1>
			<Badge variant="secondary">{channelType.label()}</Badge>
		</div>
		<p class="text-muted-foreground">{m.notification_edit_subtitle()}</p>
		{#snippet actions()}
			<Button variant="destructive" size="icon" onclick={() => (showDeleteDialog = true)}
				><Trash2 class="h-4 w-4" /></Button
			>
		{/snippet}
	</PageHeader>

	<form method="POST" action="?/update" use:enhance>
		{#if $message}
			<Alert variant="destructive" class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{$message}</AlertDescription>
			</Alert>
		{/if}

		<input type="hidden" name="type" value={$form.type} />

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
						required
						disabled={$delayed}
						aria-invalid={$errors.name ? "true" : undefined}
					/>
					<Field.Error errors={$errors.name} />
				</Field.Field>

				<Field.Field>
					<Field.Label>{m.notification_channel_type()}</Field.Label>
					<div class="flex items-center gap-3 rounded-lg border p-4">
						<TypeIcon class="h-5 w-5 shrink-0" />
						<div>
							<div class="font-medium">{channelType.label()}</div>
							<Field.Description>
								{m.notification_type_cannot_change()}
							</Field.Description>
						</div>
					</div>
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
					{m.notification_saving()}
				{:else}
					{m.notification_save()}
				{/if}
			</Button>
		</div>
	</form>

	<form
		method="POST"
		action="?/monitors"
		use:enhanceForm={() => {
			savingMonitors = true;
			return async ({ result, update }) => {
				savingMonitors = false;
				if (result.type === "success") {
					savedMonitorIds = attachedMonitorIds;
					toast.success(m.channel_monitors_saved());
				} else {
					toast.error(m.channel_monitors_save_failed());
				}
				await update({ reset: false });
			};
		}}
	>
		{#each attachedMonitorIds as id (id)}
			<input type="hidden" name="monitorIds" value={id} />
		{/each}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.channel_monitors_title()}</Card.Title>
				<Card.Description>{m.channel_monitors_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<MaintenanceMonitorPicker
					monitors={data.monitors}
					bind:selected={attachedMonitorIds}
					disabled={savingMonitors}
				/>
			</Card.Content>
			{#if data.monitors.length > 0}
				<Card.Footer class="justify-end">
					<Button type="submit" variant="outline" disabled={savingMonitors || !monitorsDirty}>
						{#if savingMonitors}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						{m.channel_monitors_save()}
					</Button>
				</Card.Footer>
			{/if}
		</Card.Root>
	</form>
</div>

<DeleteDialog
	open={showDeleteDialog}
	itemId={data.channel.id}
	onOpenChange={(open) => (showDeleteDialog = open)}
	onDelete={handleDelete}
	title={m.notifications_delete_title()}
	description={m.notifications_delete_confirm({ name: data.channel.name })}
/>
