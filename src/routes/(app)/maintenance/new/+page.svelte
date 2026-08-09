<script lang="ts">
	import { Alert, AlertDescription } from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Field from "$lib/components/ui/field";
	import { Input } from "$lib/components/ui/input";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Textarea } from "$lib/components/ui/textarea";
	import { m } from "$lib/paraglide/messages.js";
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

	function dateToLocalInput(d: Date | string | undefined | null): string {
		if (!d) return "";
		const date = new Date(d);
		if (Number.isNaN(date.getTime())) return "";
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
			<h1 class="text-3xl font-bold tracking-tight">{m.maintenance_new_title()}</h1>
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
							aria-invalid={$errors.endsAt ? "true" : undefined}
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
					<p class="text-muted-foreground py-4 text-center text-sm">
						{m.maintenance_form_no_monitors()}
					</p>
				{:else}
					<ScrollArea class="h-96 rounded-md border p-3">
						<div class="space-y-2">
							{#each data.monitors as monitor (monitor.id)}
								<label
									class="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-md border p-2 transition-colors"
								>
									<Checkbox
										checked={($form.monitorIds ?? []).includes(monitor.id)}
										onCheckedChange={() => toggleMonitor(monitor.id)}
										disabled={$delayed}
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
