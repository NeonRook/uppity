<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import DeleteDialog from "$lib/components/delete-dialog.svelte";
	import MonitorPicker from "$lib/components/maintenance-monitor-picker.svelte";
	import { Alert, AlertDescription } from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Field from "$lib/components/ui/field";
	import { Input } from "$lib/components/ui/input";
	import { Textarea } from "$lib/components/ui/textarea";
	import {
		dateToLocalInput,
		formatDateTimeRange,
		formatDuration,
		formatRelativeTime,
		getTimeZoneLabel,
		localInputToDate,
	} from "$lib/format";
	import { getMaintenanceStatusBadge } from "$lib/maintenance";
	import { m } from "$lib/paraglide/messages.js";
	import { getLocale } from "$lib/paraglide/runtime";
	import { cancelMaintenanceWindow, deleteMaintenanceWindow } from "$lib/remote/maintenance.remote";
	import { ArrowLeft, CircleAlert, LoaderCircle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	type FormMessage = { type: "success" } | { type: "error"; text?: string };

	let { data } = $props();

	const w = $derived(data.window);
	const isMutable = $derived(w.status === "scheduled" || w.status === "in_progress");
	// Only a window that has not started can be removed outright; the service enforces
	// the same rule, so this is presentation, not the guard.
	const isDeletable = $derived(w.status === "scheduled");

	const { form, errors, enhance, delayed, message } = superForm<typeof data.form.data, FormMessage>(
		untrack(() => data.form),
		{
			dataType: "json",
			resetForm: false,
		},
	);

	let cancelDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);

	/**
	 * DeleteDialog toasts `e.message`, but only when the rejection is an `Error`
	 * instance — otherwise it falls back to a hardcoded English "Delete failed".
	 * Remote-function rejections are not guaranteed to arrive as `Error`, so the
	 * translated message is re-wrapped here rather than left to that check.
	 */
	function toError(err: unknown): Error {
		if (err instanceof Error) return err;
		const message =
			typeof err === "object" && err !== null && "message" in err
				? String((err as { message: unknown }).message)
				: m.maintenance_error_unexpected();
		return new Error(message);
	}

	async function handleCancel(id: string) {
		try {
			await cancelMaintenanceWindow({ windowId: id });
		} catch (err) {
			throw toError(err);
		}
		await goto(resolve("/maintenance"));
	}

	async function handleDelete(id: string) {
		try {
			await deleteMaintenanceWindow({ windowId: id });
		} catch (err) {
			throw toError(err);
		}
		await goto(resolve("/maintenance"));
	}

	let startsAtStr = $state(dateToLocalInput($form.startsAt));
	let endsAtStr = $state(dateToLocalInput($form.endsAt));

	$effect(() => {
		const parsed = localInputToDate(startsAtStr);
		$form.startsAt = parsed as unknown as Date;
	});
	$effect(() => {
		const parsed = localInputToDate(endsAtStr);
		$form.endsAt = parsed as unknown as Date;
	});

	const sb = $derived(getMaintenanceStatusBadge(w.status));
	const inputsDisabled = $derived(!isMutable || $delayed);
	const timeZoneNote = $derived(
		m.maintenance_form_timezone_note({ zone: getTimeZoneLabel(getLocale()) }),
	);
</script>

<svelte:head>
	<title>{w.name} - {m.maintenance_page_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/maintenance">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="truncate text-2xl font-semibold tracking-tight">{w.name}</h1>
				<Badge variant={sb.variant} class={sb.class}>{sb.label}</Badge>
			</div>
			<!-- The schedule is the thing this page is about, so it reads at the top as
			     mono readouts rather than only as two form controls further down. -->
			<div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
				<span class="font-mono">{formatDateTimeRange(w.startsAt, w.endsAt, getLocale())}</span>
				<span aria-hidden="true">·</span>
				<span class="font-mono" title={m.maintenance_duration_label()}>
					{formatDuration(w.startsAt, w.endsAt)}
				</span>
				{#if isMutable}
					<span aria-hidden="true">·</span>
					<span>
						{w.status === "in_progress"
							? m.maintenance_ends_relative({
									relative: formatRelativeTime(w.endsAt, getLocale()),
								})
							: m.maintenance_starts_relative({
									relative: formatRelativeTime(w.startsAt, getLocale()),
								})}
					</span>
				{/if}
			</div>
		</div>
	</div>

	{#if !isMutable}
		<Alert>
			<CircleAlert class="h-4 w-4" />
			<AlertDescription>{m.maintenance_readonly_notice()}</AlertDescription>
		</Alert>
	{/if}

	<form method="POST" action="?/update" use:enhance>
		{#if $message}
			<Alert variant={$message.type === "success" ? "default" : "destructive"} class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>
					{$message.type === "success" ? m.maintenance_edit_updated() : ($message.text ?? "")}
				</AlertDescription>
			</Alert>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.maintenance_form_details()}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<Field.Field>
					<Field.Label for="name">{m.maintenance_form_name()} *</Field.Label>
					<Input
						id="name"
						name="name"
						bind:value={$form.name}
						disabled={inputsDisabled}
						aria-invalid={$errors.name ? "true" : undefined}
					/>
					<Field.Error errors={$errors.name} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="description">{m.maintenance_form_description()}</Field.Label>
					<Textarea
						id="description"
						name="description"
						bind:value={$form.description}
						disabled={inputsDisabled}
						rows={3}
						aria-invalid={$errors.description ? "true" : undefined}
					/>
					<Field.Error errors={$errors.description} />
				</Field.Field>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="startsAt">{m.maintenance_form_starts_at()} *</Field.Label>
						<Input
							id="startsAt"
							name="startsAt"
							type="datetime-local"
							bind:value={startsAtStr}
							disabled={inputsDisabled}
							aria-describedby="timezone-note"
							aria-invalid={$errors.startsAt ? "true" : undefined}
						/>
						<Field.Error errors={$errors.startsAt} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="endsAt">{m.maintenance_form_ends_at()} *</Field.Label>
						<Input
							id="endsAt"
							name="endsAt"
							type="datetime-local"
							bind:value={endsAtStr}
							disabled={inputsDisabled}
							aria-describedby="timezone-note"
							aria-invalid={$errors.endsAt ? "true" : undefined}
						/>
						<Field.Error errors={$errors.endsAt} />
					</Field.Field>
				</div>

				{#if isMutable}
					<p id="timezone-note" class="text-muted-foreground text-xs">{timeZoneNote}</p>
				{/if}

				{#if $errors._errors && $errors._errors.length > 0}
					<Field.Error errors={$errors._errors} />
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>{m.maintenance_form_affected_monitors()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<MonitorPicker
					monitors={data.monitors}
					bind:selected={() => $form.monitorIds ?? [], (value) => ($form.monitorIds = value)}
					disabled={inputsDisabled}
					readOnly={!isMutable}
				/>
				{#if isMutable}
					<Field.Error errors={$errors.monitorIds?._errors} />
				{/if}
			</Card.Content>
		</Card.Root>

		{#if isMutable}
			<div class="mt-6 flex flex-wrap items-center justify-between gap-4">
				<div class="flex flex-wrap gap-2">
					{#if isDeletable}
						<Button
							type="button"
							variant="destructive"
							onclick={() => (deleteDialogOpen = true)}
							disabled={$delayed}
						>
							{m.maintenance_delete_button()}
						</Button>
					{/if}
					<Button
						type="button"
						variant="outline"
						onclick={() => (cancelDialogOpen = true)}
						disabled={$delayed}
					>
						{m.maintenance_cancel_button()}
					</Button>
				</div>
				<Button type="submit" disabled={inputsDisabled}>
					{#if $delayed}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{m.common_saving()}
					{:else}
						{m.maintenance_edit_submit()}
					{/if}
				</Button>
			</div>
		{/if}
	</form>

	{#if isMutable}
		<DeleteDialog
			open={cancelDialogOpen}
			itemId={w.id}
			onOpenChange={(open) => (cancelDialogOpen = open)}
			onDelete={handleCancel}
			title={m.maintenance_cancel_dialog_title()}
			description={m.maintenance_cancel_dialog_description()}
			confirmText={m.maintenance_cancel_dialog_confirm()}
			confirmingText={m.maintenance_cancel_dialog_confirming()}
			cancelText={m.maintenance_cancel_dialog_keep()}
		/>
	{/if}

	{#if isDeletable}
		<DeleteDialog
			open={deleteDialogOpen}
			itemId={w.id}
			onOpenChange={(open) => (deleteDialogOpen = open)}
			onDelete={handleDelete}
			title={m.maintenance_delete_dialog_title()}
			description={m.maintenance_delete_dialog_description()}
			confirmText={m.maintenance_delete_dialog_confirm()}
			confirmingText={m.maintenance_delete_dialog_confirming()}
			cancelText={m.maintenance_delete_dialog_keep()}
		/>
	{/if}
</div>
