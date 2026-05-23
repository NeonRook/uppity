<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Textarea } from '$lib/components/ui/textarea';
	import { getMaintenanceStatusBadge } from '$lib/maintenance';
	import { m } from '$lib/paraglide/messages.js';
	import { ArrowLeft, CircleAlert, LoaderCircle } from '@lucide/svelte';

	type FormMessage = { type: 'success' } | { type: 'error'; text?: string };

	let { data } = $props();

	const w = $derived(data.window);
	const isMutable = $derived(w.status === 'scheduled' || w.status === 'in_progress');

	const { form, errors, enhance, delayed, message } = superForm<typeof data.form.data, FormMessage>(
		untrack(() => data.form),
		{
			dataType: 'json',
			resetForm: false
		}
	);

	let cancelDialogOpen = $state(false);

	function dateToLocalInput(d: Date | string | undefined | null): string {
		if (!d) return '';
		const date = new Date(d);
		if (Number.isNaN(date.getTime())) return '';
		const offset = date.getTimezoneOffset() * 60_000;
		return new Date(date.getTime() - offset).toISOString().slice(0, 16);
	}

	let startsAtStr = $state(dateToLocalInput($form.startsAt));
	let endsAtStr = $state(dateToLocalInput($form.endsAt));

	$effect(() => {
		if (!startsAtStr) {
			// Use `undefined as never` to clear without violating the v.date() type assertion.
			// valibot will fail validation, surfacing the error to the user.
			$form.startsAt = undefined as unknown as Date;
			return;
		}
		const d = new Date(startsAtStr);
		if (!Number.isNaN(d.getTime())) {
			$form.startsAt = d;
		}
	});
	$effect(() => {
		if (!endsAtStr) {
			$form.endsAt = undefined as unknown as Date;
			return;
		}
		const d = new Date(endsAtStr);
		if (!Number.isNaN(d.getTime())) {
			$form.endsAt = d;
		}
	});

	function toggleMonitor(id: string) {
		const current = $form.monitorIds ?? [];
		if (current.includes(id)) {
			$form.monitorIds = current.filter((mid) => mid !== id);
		} else {
			$form.monitorIds = [...current, id];
		}
	}

	const sb = $derived(getMaintenanceStatusBadge(w.status));
	const inputsDisabled = $derived(!isMutable || $delayed);
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
				<h1 class="truncate text-3xl font-bold tracking-tight">{w.name}</h1>
				<Badge variant={sb.variant}>{sb.label}</Badge>
			</div>
			<p class="text-muted-foreground">{m.maintenance_edit_title()}</p>
		</div>
	</div>

	<form method="POST" action="?/update" use:enhance>
		{#if $message}
			<Alert
				variant={$message.type === 'success' ? 'default' : 'destructive'}
				class="mb-6"
			>
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>
					{$message.type === 'success' ? m.maintenance_edit_updated() : ($message.text ?? '')}
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
						aria-invalid={$errors.name ? 'true' : undefined}
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
						aria-invalid={$errors.description ? 'true' : undefined}
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
							aria-invalid={$errors.startsAt ? 'true' : undefined}
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
							aria-invalid={$errors.endsAt ? 'true' : undefined}
						/>
						<Field.Error errors={$errors.endsAt} />
					</Field.Field>
				</div>

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
				{#if data.monitors.length === 0}
					<p class="py-4 text-center text-sm text-muted-foreground">
						{m.maintenance_form_no_monitors()}
					</p>
				{:else}
					<ScrollArea class="h-96 rounded-md border p-3">
						<div class="space-y-2">
							{#each data.monitors as monitor (monitor.id)}
								<label
									class="flex items-center gap-3 rounded-md border p-2 transition-colors {inputsDisabled
										? 'cursor-not-allowed opacity-60'
										: 'cursor-pointer hover:bg-muted'}"
								>
									<Checkbox
										checked={($form.monitorIds ?? []).includes(monitor.id)}
										onCheckedChange={() => toggleMonitor(monitor.id)}
										disabled={inputsDisabled}
									/>
									<span class="flex-1 truncate text-sm font-medium">{monitor.name}</span>
								</label>
							{/each}
						</div>
					</ScrollArea>
					<Field.Error errors={$errors.monitorIds?._errors} />
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="mt-6 flex justify-between gap-4">
			{#if isMutable}
				<Button
					type="button"
					variant="destructive"
					onclick={() => (cancelDialogOpen = true)}
					disabled={$delayed}
				>
					{m.maintenance_cancel_button()}
				</Button>
			{:else}
				<div></div>
			{/if}
			<div class="flex gap-4">
				<Button variant="outline" href="/maintenance" disabled={$delayed}>
					{m.common_cancel()}
				</Button>
				<Button type="submit" disabled={inputsDisabled}>
					{#if $delayed}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{m.common_saving()}
					{:else}
						{m.maintenance_edit_submit()}
					{/if}
				</Button>
			</div>
		</div>
	</form>

	{#if isMutable}
		<AlertDialog.Root bind:open={cancelDialogOpen}>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>{m.maintenance_cancel_dialog_title()}</AlertDialog.Title>
					<AlertDialog.Description>
						{m.maintenance_cancel_dialog_description()}
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>{m.maintenance_cancel_dialog_keep()}</AlertDialog.Cancel>
					<form method="POST" action="?/cancel">
						<Button type="submit" variant="destructive">
							{m.maintenance_cancel_dialog_confirm()}
						</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>
	{/if}
</div>
