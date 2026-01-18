<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Field from '$lib/components/ui/field';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { LoaderCircle, Trash2, FileText, Pencil, X } from '@lucide/svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import {
		getStatusInfo,
		getImpactInfo,
		getStatusLabel,
		getImpactLabel,
		formatIncidentDate
	} from '$lib/incidents';
	import {
		INCIDENT_STATUS_VALUES,
		INCIDENT_IMPACTS,
		type IncidentStatusValue,
		type IncidentImpact
	} from '$lib/constants/status';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const {
		form: editForm,
		errors: editErrors,
		enhance: editEnhance,
		delayed: editDelayed,
		message: editMessage
	} = superForm(untrack(() => data.updateForm));

	const {
		form: addForm,
		errors: addErrors,
		enhance: addEnhance,
		delayed: addDelayed,
		message: addMessage,
		reset: resetAddForm
	} = superForm(
		untrack(() => data.addUpdateForm),
		{
			onUpdated: ({ form }) => {
				if (form.valid) {
					resetAddForm();
				}
			}
		}
	);

	const {
		form: postmortemForm,
		errors: postmortemErrors,
		enhance: postmortemEnhance,
		delayed: postmortemDelayed,
		message: postmortemMessage
	} = superForm(untrack(() => data.postmortemForm));

	const {
		form: editPostmortemForm,
		errors: editPostmortemErrors,
		enhance: editPostmortemEnhance,
		delayed: editPostmortemDelayed,
		message: editPostmortemMessage
	} = superForm(
		untrack(() => data.editPostmortemForm),
		{ resetForm: false }
	);

	let showDeleteDialog = $state(false);
	let editingPostmortem = $state(false);

	// Get existing postmortem if any
	const existingPostmortem = $derived(data.incident.updates.find((u) => u.status === 'postmortem'));

	const statusInfo = $derived(getStatusInfo(data.incident.status));
	const impactInfo = $derived(getImpactInfo(data.incident.impact));
</script>

<svelte:head>
	<title>{data.incident.title} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader backHref="/incidents">
		<div class="flex items-center gap-2">
			<h1 class="text-2xl font-bold tracking-tight">{data.incident.title}</h1>
			<Badge variant={statusInfo.variant}>{getStatusLabel(data.incident.status)}</Badge>
			<Badge variant={impactInfo.variant}>
				{m.incidents_impact({ impact: getImpactLabel(data.incident.impact) })}
			</Badge>
		</div>
		<p class="text-sm text-muted-foreground">
			{m.incident_started_at({ date: formatIncidentDate(data.incident.startedAt) })}
			{#if data.incident.resolvedAt}
				| {m.incident_resolved_at({ date: formatIncidentDate(data.incident.resolvedAt) })}
			{/if}
		</p>
		{#snippet actions()}
			<Button variant="destructive" size="icon" onclick={() => (showDeleteDialog = true)}>
				<Trash2 class="h-4 w-4" />
			</Button>
		{/snippet}
	</PageHeader>

	{#if $editMessage}
		<Alert>
			<AlertDescription>{$editMessage}</AlertDescription>
		</Alert>
	{/if}

	{#if $addMessage}
		<Alert>
			<AlertDescription>{$addMessage}</AlertDescription>
		</Alert>
	{/if}

	{#if $postmortemMessage}
		<Alert>
			<AlertDescription>{$postmortemMessage}</AlertDescription>
		</Alert>
	{/if}

	{#if $editPostmortemMessage}
		<Alert>
			<AlertDescription>{$editPostmortemMessage}</AlertDescription>
		</Alert>
	{/if}

	<!-- Add Update -->
	{#if data.incident.status !== 'resolved'}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.incident_post_update()}</Card.Title>
				<Card.Description>{m.incident_post_update_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/addUpdate" class="space-y-4" use:addEnhance>
					<Field.Field>
						<Field.Label for="status">{m.incident_new_status()}</Field.Label>
						<Select.Root
							type="single"
							name="status"
							value={$addForm.status}
							onValueChange={(v) => ($addForm.status = v as IncidentStatusValue)}
						>
							<Select.Trigger class="w-full">
								{getStatusLabel($addForm.status) || m.incident_select_status()}
							</Select.Trigger>
							<Select.Content>
								{#each INCIDENT_STATUS_VALUES as status (status)}
									<Select.Item value={status}>{getStatusLabel(status)}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="status" bind:value={$addForm.status} />
						<Field.Error errors={$addErrors.status} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="message">{m.incident_update_message()} *</Field.Label>
						<Textarea
							id="message"
							name="message"
							placeholder={m.incident_update_placeholder()}
							bind:value={$addForm.message}
							disabled={$addDelayed}
							rows={3}
							aria-invalid={$addErrors.message ? 'true' : undefined}
						/>
						<Field.Error errors={$addErrors.message} />
					</Field.Field>

					<Button type="submit" disabled={$addDelayed || !$addForm.message?.trim()}>
						{#if $addDelayed}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
							{m.incident_posting()}
						{:else}
							{m.incident_post_update()}
						{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Postmortem Section (only for resolved incidents) -->
	{#if data.incident.status === 'resolved'}
		<Card.Root class="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<FileText class="h-5 w-5 text-blue-600 dark:text-blue-400" />
					{m.incident_postmortem()}
				</Card.Title>
				<Card.Description>
					{#if existingPostmortem}
						{m.incident_postmortem_desc_existing()}
					{:else}
						{m.incident_postmortem_desc_new()}
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if existingPostmortem}
					{#if editingPostmortem}
						<!-- Edit postmortem form -->
						<form
							method="POST"
							action="?/editPostmortem"
							class="space-y-4"
							use:editPostmortemEnhance
						>
							<input type="hidden" name="updateId" value={existingPostmortem.id} />
							<Field.Field>
								<Field.Label for="edit-postmortem-message"
									>{m.incident_postmortem_content()} *</Field.Label
								>
								<Textarea
									id="edit-postmortem-message"
									name="message"
									placeholder={m.incident_postmortem_placeholder()}
									bind:value={$editPostmortemForm.message}
									disabled={$editPostmortemDelayed}
									rows={6}
									aria-invalid={$editPostmortemErrors.message ? 'true' : undefined}
								/>
								<Field.Error errors={$editPostmortemErrors.message} />
							</Field.Field>

							<div class="flex gap-2">
								<Button
									type="submit"
									disabled={$editPostmortemDelayed || !$editPostmortemForm.message?.trim()}
								>
									{#if $editPostmortemDelayed}
										<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
										{m.common_saving()}
									{:else}
										{m.common_save_changes()}
									{/if}
								</Button>
								<Button type="button" variant="outline" onclick={() => (editingPostmortem = false)}>
									<X class="mr-2 h-4 w-4" />
									{m.common_cancel()}
								</Button>
							</div>
						</form>
					{:else}
						<!-- Show existing postmortem -->
						<div class="space-y-4">
							<div class="rounded-md bg-card p-4">
								<p class="text-sm whitespace-pre-wrap">{existingPostmortem.message}</p>
							</div>
							<div class="flex items-center justify-between">
								<p class="text-xs text-muted-foreground">
									{m.incident_postmortem_published({
										date: formatIncidentDate(existingPostmortem.createdAt)
									})}
								</p>
								<Button variant="outline" size="sm" onclick={() => (editingPostmortem = true)}>
									<Pencil class="mr-2 h-3 w-3" />
									{m.common_edit()}
								</Button>
							</div>
						</div>
					{/if}
				{:else}
					<!-- Add postmortem form -->
					<form method="POST" action="?/addPostmortem" class="space-y-4" use:postmortemEnhance>
						<Field.Field>
							<Field.Label for="postmortem-message">{m.incident_postmortem_content()} *</Field.Label
							>
							<Textarea
								id="postmortem-message"
								name="message"
								placeholder={m.incident_postmortem_placeholder()}
								bind:value={$postmortemForm.message}
								disabled={$postmortemDelayed}
								rows={6}
								aria-invalid={$postmortemErrors.message ? 'true' : undefined}
							/>
							<Field.Error errors={$postmortemErrors.message} />
						</Field.Field>

						<Button type="submit" disabled={$postmortemDelayed || !$postmortemForm.message?.trim()}>
							{#if $postmortemDelayed}
								<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
								{m.incident_postmortem_publishing()}
							{:else}
								<FileText class="mr-2 h-4 w-4" />
								{m.incident_postmortem_publish()}
							{/if}
						</Button>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Timeline -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.incident_timeline()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="relative space-y-6">
				{#each data.incident.updates as update, i (update.id)}
					{@const updateStatusInfo = getStatusInfo(update.status)}
					{@const UpdateIcon = updateStatusInfo.icon}
					<div class="relative flex gap-4">
						{#if i < data.incident.updates.length - 1}
							<div class="absolute top-8 left-3.75 h-full w-0.5 bg-border"></div>
						{/if}
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
							<UpdateIcon class="h-4 w-4" />
						</div>
						<div class="flex-1 pb-2">
							<div class="flex items-center gap-2">
								<Badge variant={updateStatusInfo.variant} class="text-xs">
									{getStatusLabel(update.status)}
								</Badge>
								<span class="text-xs text-muted-foreground">
									{formatIncidentDate(update.createdAt)}
								</span>
							</div>
							<p class="mt-1 text-sm">{update.message}</p>
						</div>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Affected Monitors -->
	{#if data.incident.affectedMonitors.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.incident_affected_monitors()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-wrap gap-2">
					{#each data.incident.affectedMonitors as monitor (monitor.id)}
						<Badge variant="outline">
							{monitor.name}
							<span class="ml-1 text-xs opacity-50">({monitor.type})</span>
						</Badge>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Edit Incident -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.incident_edit()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/update" class="space-y-4" use:editEnhance>
				<Field.Field>
					<Field.Label for="title">{m.incident_title_label()}</Field.Label>
					<Input
						id="title"
						name="title"
						bind:value={$editForm.title}
						disabled={$editDelayed}
						aria-invalid={$editErrors.title ? 'true' : undefined}
					/>
					<Field.Error errors={$editErrors.title} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="impact">{m.incident_impact()}</Field.Label>
					<Select.Root
						type="single"
						name="impact"
						value={$editForm.impact}
						onValueChange={(v) => ($editForm.impact = v as IncidentImpact)}
					>
						<Select.Trigger class="w-full">
							{getImpactLabel($editForm.impact) || m.incident_select_impact()}
						</Select.Trigger>
						<Select.Content>
							{#each INCIDENT_IMPACTS as impact (impact)}
								<Select.Item value={impact}>{getImpactLabel(impact)}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="impact" bind:value={$editForm.impact} />
					<Field.Error errors={$editErrors.impact} />
				</Field.Field>

				<Button type="submit" disabled={$editDelayed}>
					{#if $editDelayed}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{m.common_saving()}
					{:else}
						{m.common_save_changes()}
					{/if}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<DeleteDialog
	open={showDeleteDialog}
	onOpenChange={(open) => (showDeleteDialog = open)}
	title={m.incident_delete_confirm()}
	description={m.incident_delete_desc({ title: data.incident.title })}
/>
