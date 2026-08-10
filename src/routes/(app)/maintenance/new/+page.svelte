<script lang="ts">
	import MonitorPicker from "$lib/components/maintenance-monitor-picker.svelte";
	import { Alert, AlertDescription } from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Field from "$lib/components/ui/field";
	import { Input } from "$lib/components/ui/input";
	import { Textarea } from "$lib/components/ui/textarea";
	import { dateToLocalInput, getTimeZoneLabel, localInputToDate } from "$lib/format";
	import { m } from "$lib/paraglide/messages.js";
	import { getLocale } from "$lib/paraglide/runtime";
	import { ArrowLeft, CircleAlert, LoaderCircle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	let { data } = $props();

	const { form, errors, enhance, delayed, message } = superForm(
		untrack(() => data.form),
		{
			dataType: "json",
		},
	);

	let startsAtStr = $state(dateToLocalInput($form.startsAt));
	let endsAtStr = $state(dateToLocalInput($form.endsAt));

	// `datetime-local` speaks strings; the schema wants Dates. Clearing the control has
	// to clear the model too, or validation would pass against a stale value the user
	// can no longer see.
	$effect(() => {
		const parsed = localInputToDate(startsAtStr);
		$form.startsAt = parsed as unknown as Date;
	});
	$effect(() => {
		const parsed = localInputToDate(endsAtStr);
		$form.endsAt = parsed as unknown as Date;
	});

	const timeZoneNote = $derived(
		m.maintenance_form_timezone_note({ zone: getTimeZoneLabel(getLocale()) }),
	);
</script>

<svelte:head>
	<title>{m.maintenance_new_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/maintenance">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{m.maintenance_new_title()}</h1>
			<p class="text-muted-foreground">
				{m.maintenance_new_description()}
			</p>
		</div>
	</div>

	<form method="POST" use:enhance>
		{#if $message}
			<Alert variant="destructive" class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{$message}</AlertDescription>
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
						disabled={$delayed}
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
						disabled={$delayed}
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
							disabled={$delayed}
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
							disabled={$delayed}
							aria-describedby="timezone-note"
							aria-invalid={$errors.endsAt ? "true" : undefined}
						/>
						<Field.Error errors={$errors.endsAt} />
					</Field.Field>
				</div>

				<!-- datetime-local is silently browser-local. A window scheduled days ahead by
				     one member and read by another is ambiguous unless the zone is named. -->
				<p id="timezone-note" class="text-muted-foreground text-xs">{timeZoneNote}</p>

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
					disabled={$delayed}
				/>
				<Field.Error errors={$errors.monitorIds?._errors} />
			</Card.Content>
		</Card.Root>

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/maintenance" disabled={$delayed}>
				{m.common_cancel()}
			</Button>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{m.common_saving()}
				{:else}
					{m.maintenance_new_submit()}
				{/if}
			</Button>
		</div>
	</form>
</div>
