<script lang="ts">
	import { CircleAlert, LoaderCircle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import MaintenanceFormFields from "#lib/components/maintenance-form-fields.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const superform = superForm(
		untrack(() => data.form),
		{
			dataType: "json",
		},
	);
	const { enhance, delayed, message } = superform;
</script>

<svelte:head>
	<title>{m.maintenance_new_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader
		backHref="/maintenance"
		title={m.maintenance_new_title()}
		description={m.maintenance_new_description()}
	/>

	<form method="POST" use:enhance>
		{#if $message}
			<Alert variant="destructive" class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{$message}</AlertDescription>
			</Alert>
		{/if}

		<MaintenanceFormFields {superform} monitors={data.monitors} disabled={$delayed} />

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
