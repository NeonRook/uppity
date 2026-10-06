<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { CircleAlert, LoaderCircle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import DeleteDialog from "#lib/components/delete-dialog.svelte";
	import MaintenanceFormFields from "#lib/components/maintenance-form-fields.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { formatDateTimeRange, formatDuration, formatRelativeTime } from "#lib/format.js";
	import { getMaintenanceStatusBadge } from "#lib/maintenance.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getLocale } from "#lib/paraglide/runtime.js";
	import {
		cancelMaintenanceWindow,
		deleteMaintenanceWindow,
	} from "#lib/remote/maintenance.remote.js";

	type FormMessage = { type: "success" } | { type: "error"; text?: string };

	let { data } = $props();

	const w = $derived(data.window);
	const isMutable = $derived(w.status === "scheduled" || w.status === "in_progress");
	// Only a window that has not started can be removed outright; the service enforces
	// the same rule, so this is presentation, not the guard.
	const isDeletable = $derived(w.status === "scheduled");

	const superform = superForm<typeof data.form.data, FormMessage>(
		untrack(() => data.form),
		{
			dataType: "json",
			resetForm: false,
		},
	);
	const { enhance, delayed, message } = superform;

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
		// Not `message`: that name is the superforms store in the enclosing scope, and
		// shadowing it here would read as the form's message while holding a string.
		const text =
			typeof err === "object" && err !== null && "message" in err
				? String((err as { message: unknown }).message)
				: m.maintenance_error_unexpected();
		return new Error(text);
	}

	async function handleCancel(id: string) {
		try {
			await cancelMaintenanceWindow({ windowId: id });
		} catch (err) {
			throw toError(err);
		}
		await goto(resolve("maintenance"));
	}

	async function handleDelete(id: string) {
		try {
			await deleteMaintenanceWindow({ windowId: id });
		} catch (err) {
			throw toError(err);
		}
		await goto(resolve("maintenance"));
	}

	const sb = $derived(getMaintenanceStatusBadge(w.status));
	const inputsDisabled = $derived(!isMutable || $delayed);
</script>

<svelte:head>
	<title>{w.name} - {m.maintenance_page_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader backHref="/maintenance">
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
	</PageHeader>

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
				<AlertDescription
					>{$message.type === "success"
						? m.maintenance_edit_updated()
						: ($message.text ?? "")}</AlertDescription
				>
			</Alert>
		{/if}

		<MaintenanceFormFields
			{superform}
			monitors={data.monitors}
			disabled={inputsDisabled}
			readOnly={!isMutable}
		/>

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
