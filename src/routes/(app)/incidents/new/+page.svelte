<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { Monitor } from '$lib/server/db/schema';
	import type { CreateIncidentForm } from '$lib/schemas/incident';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, ArrowLeft, LoaderCircle } from '@lucide/svelte';

	interface Props {
		data: {
			monitors: Monitor[];
			form: SuperValidated<CreateIncidentForm>;
		};
	}

	let { data }: Props = $props();

	const { form, errors, enhance, delayed, message } = superForm(untrack(() => data.form));

	let selectedMonitors = new SvelteSet<string>();

	const statusOptions = [
		{ value: 'investigating', label: 'Investigating' },
		{ value: 'identified', label: 'Identified' },
		{ value: 'monitoring', label: 'Monitoring' },
		{ value: 'resolved', label: 'Resolved' }
	] as const;

	const impactOptions = [
		{ value: 'none', label: 'None - No impact' },
		{ value: 'minor', label: 'Minor - Some users affected' },
		{ value: 'major', label: 'Major - Many users affected' },
		{ value: 'critical', label: 'Critical - All users affected' }
	] as const;

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
	<title>Report Incident - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/incidents">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Report Incident</h1>
			<p class="text-muted-foreground">Create a new incident report</p>
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
				<Card.Title>Incident Details</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="title">Title *</Label>
					<Input
						id="title"
						name="title"
						placeholder="API experiencing high latency"
						bind:value={$form.title}
						disabled={$delayed}
						aria-invalid={$errors.title ? 'true' : undefined}
					/>
					{#if $errors.title}
						<p class="text-sm text-destructive">{$errors.title}</p>
					{/if}
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="status">Status</Label>
						<Select.Root
							type="single"
							name="status"
							value={$form.status}
							onValueChange={(v) =>
								($form.status = v as 'investigating' | 'identified' | 'monitoring' | 'resolved')}
						>
							<Select.Trigger class="w-full">
								{statusOptions.find((s) => s.value === $form.status)?.label || 'Select status'}
							</Select.Trigger>
							<Select.Content>
								{#each statusOptions as opt (opt.value)}
									<Select.Item value={opt.value}>{opt.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="status" bind:value={$form.status} />
						{#if $errors.status}
							<p class="text-sm text-destructive">{$errors.status}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="impact">Impact</Label>
						<Select.Root
							type="single"
							name="impact"
							value={$form.impact}
							onValueChange={(v) => ($form.impact = v as 'none' | 'minor' | 'major' | 'critical')}
						>
							<Select.Trigger class="w-full">
								{impactOptions.find((i) => i.value === $form.impact)?.label.split(' - ')[0] ||
									'Select impact'}
							</Select.Trigger>
							<Select.Content>
								{#each impactOptions as opt (opt.value)}
									<Select.Item value={opt.value}>{opt.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="impact" bind:value={$form.impact} />
						{#if $errors.impact}
							<p class="text-sm text-destructive">{$errors.impact}</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="message">Initial Update *</Label>
					<Textarea
						id="message"
						name="message"
						placeholder="We are investigating reports of increased latency..."
						bind:value={$form.message}
						disabled={$delayed}
						rows={4}
						aria-invalid={$errors.message ? 'true' : undefined}
					/>
					{#if $errors.message}
						<p class="text-sm text-destructive">{$errors.message}</p>
					{/if}
					<p class="text-xs text-muted-foreground">
						This message will be shown in the incident timeline.
					</p>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>Affected Monitors</Card.Title>
				<Card.Description>Select the monitors affected by this incident</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.monitors.length === 0}
					<p class="py-4 text-center text-sm text-muted-foreground">No monitors available.</p>
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
			<Button variant="outline" href="/incidents" disabled={$delayed}>Cancel</Button>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					Creating...
				{:else}
					Create Incident
				{/if}
			</Button>
		</div>
	</form>
</div>
