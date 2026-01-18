<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, ArrowLeft, LoaderCircle } from '@lucide/svelte';
	import {
		INCIDENT_STATUS_VALUES,
		INCIDENT_IMPACTS,
		type IncidentStatusValue,
		type IncidentImpact
	} from '$lib/constants/status';
	import { getStatusLabel, getImpactLabel, getImpactDescription } from '$lib/incidents';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const { form, errors, enhance, delayed, message } = superForm(untrack(() => data.form));

	let selectedMonitors = new SvelteSet<string>();

	function toggleMonitor(id: string) {
		if (selectedMonitors.has(id)) {
			selectedMonitors.delete(id);
		} else {
			selectedMonitors.add(id);
		}
		$form.monitors = Array.from(selectedMonitors);
	}
</script>

<svelte:head>
	<title>{m.incident_new_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/incidents">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.incident_new_title()}</h1>
			<p class="text-muted-foreground">{m.incident_new_subtitle()}</p>
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
						aria-invalid={$errors.title ? 'true' : undefined}
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
						aria-invalid={$errors.message ? 'true' : undefined}
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
				{#if data.monitors.length === 0}
					<p class="py-4 text-center text-sm text-muted-foreground">
						{m.incident_no_monitors()}
					</p>
				{:else}
					<div class="space-y-3">
						{#each data.monitors as monitor (monitor.id)}
							<label
								class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
							>
								<Checkbox
									checked={selectedMonitors.has(monitor.id)}
									onCheckedChange={() => toggleMonitor(monitor.id)}
								/>
								<input
									type="checkbox"
									name="monitors"
									value={monitor.id}
									checked={selectedMonitors.has(monitor.id)}
									class="hidden"
								/>
								<div class="flex-1">
									<div class="font-medium">{monitor.name}</div>
									<div class="text-xs text-muted-foreground">
										{monitor.type.toUpperCase()} - {monitor.url ||
											`${monitor.hostname}:${monitor.port}`}
									</div>
								</div>
							</label>
						{/each}
					</div>
				{/if}
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
