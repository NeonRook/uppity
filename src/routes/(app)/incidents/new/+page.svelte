<script lang="ts">
	import { CircleAlert, LoaderCircle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import MonitorPicker from "#lib/components/maintenance-monitor-picker.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as Select from "#lib/components/ui/select/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import {
		INCIDENT_STATUS_VALUES,
		INCIDENT_IMPACTS,
		type IncidentStatusValue,
		type IncidentImpact,
	} from "#lib/constants/status.js";
	import { getStatusLabel, getImpactLabel, getImpactDescription } from "#lib/incidents.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const { form, errors, enhance, delayed, message } = superForm(
		untrack(() => data.form),
		{ dataType: "json" },
	);
</script>

<svelte:head>
	<title>{m.incident_new_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader
		backHref="/incidents"
		title={m.incident_new_title()}
		description={m.incident_new_subtitle()}
	/>

	<form method="POST" use:enhance>
		{#if $message}
			<Alert variant="destructive" class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{$message}</AlertDescription>
			</Alert>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.incident_details()}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<Field.Field>
					<Field.Label for="title">{m.incident_title_label()} *</Field.Label>
					<Input
						id="title"
						name="title"
						placeholder={m.incident_title_placeholder()}
						bind:value={$form.title}
						disabled={$delayed}
						aria-invalid={$errors.title ? "true" : undefined}
					/>
					<Field.Error errors={$errors.title} />
				</Field.Field>

				<div class="grid grid-cols-2 gap-4">
					<Field.Field>
						<Field.Label for="status">{m.common_status()}</Field.Label>
						<Select.Root
							type="single"
							name="status"
							value={$form.status}
							onValueChange={(v) => ($form.status = v as IncidentStatusValue)}
						>
							<Select.Trigger class="w-full">
								{getStatusLabel($form.status) || m.incident_select_status()}
							</Select.Trigger>
							<Select.Content>
								{#each INCIDENT_STATUS_VALUES as status (status)}
									<Select.Item value={status}>{getStatusLabel(status)}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="status" bind:value={$form.status} />
						<Field.Error errors={$errors.status} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="impact">{m.incident_impact()}</Field.Label>
						<Select.Root
							type="single"
							name="impact"
							value={$form.impact}
							onValueChange={(v) => ($form.impact = v as IncidentImpact)}
						>
							<Select.Trigger class="w-full">
								{getImpactLabel($form.impact) || m.incident_select_impact()}
							</Select.Trigger>
							<Select.Content>
								{#each INCIDENT_IMPACTS as impact (impact)}
									<Select.Item value={impact}
										>{getImpactLabel(impact)} - {getImpactDescription(impact)}</Select.Item
									>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="impact" bind:value={$form.impact} />
						<Field.Error errors={$errors.impact} />
					</Field.Field>
				</div>

				<Field.Field>
					<Field.Label for="message">{m.incident_initial_update()} *</Field.Label>
					<Textarea
						id="message"
						name="message"
						placeholder={m.incident_initial_update_placeholder()}
						bind:value={$form.message}
						disabled={$delayed}
						rows={4}
						aria-invalid={$errors.message ? "true" : undefined}
					/>
					<Field.Description>
						{m.incident_initial_update_desc()}
					</Field.Description>
					<Field.Error errors={$errors.message} />
				</Field.Field>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>{m.incident_affected_monitors()}</Card.Title>
				<Card.Description>{m.incident_affected_monitors_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<MonitorPicker
					monitors={data.monitors}
					bind:selected={() => $form.monitors ?? [], (value) => ($form.monitors = value)}
					disabled={$delayed}
				/>
			</Card.Content>
		</Card.Root>

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/incidents" disabled={$delayed}>{m.common_cancel()}</Button>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{m.incident_creating()}
				{:else}
					{m.incident_create()}
				{/if}
			</Button>
		</div>
	</form>
</div>
