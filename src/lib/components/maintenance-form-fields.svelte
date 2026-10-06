<script lang="ts">
	import type { Infer, SuperForm } from "sveltekit-superforms";

	import MonitorPicker from "#lib/components/maintenance-monitor-picker.svelte";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { dateToLocalInput, getTimeZoneLabel, localInputToDate } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getLocale } from "#lib/paraglide/runtime.js";
	import type { createMaintenanceWindowSchema } from "#lib/schemas/maintenance-window.js";

	interface Props {
		superform: SuperForm<Infer<typeof createMaintenanceWindowSchema>>;
		monitors: { id: string; name: string }[];
		disabled?: boolean;
		/** Windows that are over: monitors render as a plain list and the zone note is dropped. */
		readOnly?: boolean;
	}

	let { superform, monitors, disabled = false, readOnly = false }: Props = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors } = superform;

	// `datetime-local` speaks strings; the schema wants Dates. The controls are seeded
	// once and write back on input, so clearing a control clears the model too, or
	// validation would pass against a stale value the user can no longer see.
	const startsAtInit = dateToLocalInput($form.startsAt);
	const endsAtInit = dateToLocalInput($form.endsAt);

	const timeZoneNote = $derived(
		m.maintenance_form_timezone_note({ zone: getTimeZoneLabel(getLocale()) }),
	);
</script>

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
				{disabled}
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
				{disabled}
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
					value={startsAtInit}
					oninput={(e) =>
						($form.startsAt = localInputToDate(e.currentTarget.value) as unknown as Date)}
					{disabled}
					aria-describedby={readOnly ? undefined : "timezone-note"}
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
					value={endsAtInit}
					oninput={(e) =>
						($form.endsAt = localInputToDate(e.currentTarget.value) as unknown as Date)}
					{disabled}
					aria-describedby={readOnly ? undefined : "timezone-note"}
					aria-invalid={$errors.endsAt ? "true" : undefined}
				/>
				<Field.Error errors={$errors.endsAt} />
			</Field.Field>
		</div>

		<!-- datetime-local is silently browser-local. A window scheduled days ahead by
		     one member and read by another is ambiguous unless the zone is named. -->
		{#if !readOnly}
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
			{monitors}
			bind:selected={() => $form.monitorIds ?? [], (value) => ($form.monitorIds = value)}
			{disabled}
			{readOnly}
		/>
		{#if !readOnly}
			<Field.Error errors={$errors.monitorIds?._errors} />
		{/if}
	</Card.Content>
</Card.Root>
