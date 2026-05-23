<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Textarea } from '$lib/components/ui/textarea';
	import { ArrowLeft, CircleAlert, LoaderCircle } from '@lucide/svelte';

	let { data } = $props();

	const { form, errors, enhance, delayed, message } = superForm(untrack(() => data.form), {
		dataType: 'json'
	});

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
		if (startsAtStr) {
			const d = new Date(startsAtStr);
			if (!Number.isNaN(d.getTime())) $form.startsAt = d;
		}
	});
	$effect(() => {
		if (endsAtStr) {
			const d = new Date(endsAtStr);
			if (!Number.isNaN(d.getTime())) $form.endsAt = d;
		}
	});

	function toggleMonitor(id: string) {
		const current = $form.monitorIds ?? [];
		if (current.includes(id)) {
			$form.monitorIds = current.filter((m) => m !== id);
		} else {
			$form.monitorIds = [...current, id];
		}
	}
</script>

<svelte:head>
	<title>New maintenance window - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/maintenance">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">New maintenance window</h1>
			<p class="text-muted-foreground">
				Suppress alerts and incidents on selected monitors for a scheduled time range.
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
				<Card.Title>Details</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<Field.Field>
					<Field.Label for="name">Name *</Field.Label>
					<Input
						id="name"
						name="name"
						placeholder="Database upgrade"
						bind:value={$form.name}
						disabled={$delayed}
						aria-invalid={$errors.name ? 'true' : undefined}
					/>
					<Field.Error errors={$errors.name} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="description">Description</Field.Label>
					<Textarea
						id="description"
						name="description"
						placeholder="Optional notes about this maintenance window"
						bind:value={$form.description}
						disabled={$delayed}
						rows={3}
						aria-invalid={$errors.description ? 'true' : undefined}
					/>
					<Field.Error errors={$errors.description} />
				</Field.Field>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="startsAt">Starts at *</Field.Label>
						<Input
							id="startsAt"
							type="datetime-local"
							bind:value={startsAtStr}
							disabled={$delayed}
							aria-invalid={$errors.startsAt ? 'true' : undefined}
						/>
						<Field.Error errors={$errors.startsAt} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="endsAt">Ends at *</Field.Label>
						<Input
							id="endsAt"
							type="datetime-local"
							bind:value={endsAtStr}
							disabled={$delayed}
							aria-invalid={$errors.endsAt ? 'true' : undefined}
						/>
						<Field.Error errors={$errors.endsAt} />
					</Field.Field>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>Affected monitors</Card.Title>
				<Card.Description>Select monitors that will be under maintenance.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.monitors.length === 0}
					<p class="py-4 text-center text-sm text-muted-foreground">No monitors available.</p>
				{:else}
					<ScrollArea class="h-96 rounded-md border p-3">
						<div class="space-y-2">
							{#each data.monitors as m (m.id)}
								<label
									class="flex cursor-pointer items-center gap-3 rounded-md border p-2 transition-colors hover:bg-muted"
								>
									<Checkbox
										checked={($form.monitorIds ?? []).includes(m.id)}
										onCheckedChange={() => toggleMonitor(m.id)}
										disabled={$delayed}
									/>
									<span class="flex-1 truncate text-sm font-medium">{m.name}</span>
								</label>
							{/each}
						</div>
					</ScrollArea>
					<Field.Error errors={$errors.monitorIds?._errors} />
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/maintenance" disabled={$delayed}>Cancel</Button>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					Scheduling...
				{:else}
					Schedule maintenance
				{/if}
			</Button>
		</div>
	</form>
</div>
