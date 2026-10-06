<script lang="ts">
	import { CircleAlert, LoaderCircle, AlertTriangle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import MonitorPicker from "#lib/components/maintenance-monitor-picker.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import StatusPageFields from "#lib/components/status-page-fields.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";

	let { data } = $props();

	const superform = superForm(
		untrack(() => data.form),
		{ dataType: "json" },
	);
	const { form, message, enhance, delayed } = superform;

	// Usage limits from parent layout (self-hosted has no limits)
	const usageLimits = $derived(data.usageLimits);
	const canAddStatusPage = $derived(data.selfHosted || (usageLimits?.statusPages.canAdd ?? true));
</script>

<svelte:head>
	<title>New Status Page - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader
		backHref="/status-pages"
		title="New Status Page"
		description="Create a public status page for your users"
	/>

	<form method="POST" use:enhance>
		{#if !canAddStatusPage}
			<Alert class="mb-6">
				<AlertTriangle class="h-4 w-4" />
				<AlertDescription>
					You've reached your status page limit ({usageLimits?.statusPages.limit}). Upgrade your
					plan to add more status pages.
				</AlertDescription>
			</Alert>
		{/if}

		{#if $message}
			<Alert variant="destructive" class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{$message}</AlertDescription>
			</Alert>
		{/if}

		<StatusPageFields {superform} autoSlug />

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>Monitors</Card.Title>
				<Card.Description>Select which monitors to display on this status page</Card.Description>
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
			<Button variant="outline" href="/status-pages" disabled={$delayed}>Cancel</Button>
			<Button type="submit" disabled={$delayed || !canAddStatusPage}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					Creating...
				{:else}
					Create Status Page
				{/if}
			</Button>
		</div>
	</form>
</div>
