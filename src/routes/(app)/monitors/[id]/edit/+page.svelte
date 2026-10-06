<script lang="ts">
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import MonitorForm from "#lib/components/monitor-form.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const form = superForm(
		untrack(() => data.form),
		{
			resetForm: false,
		},
	);
</script>

<svelte:head>
	<title>{m.monitor_edit_title()} - {data.monitor.name} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6 px-4 sm:px-0">
	<PageHeader
		backHref="/monitors/{data.monitor.id}"
		title={m.monitor_edit_title()}
		description={data.monitor.name}
	/>

	<MonitorForm superform={form} mode="edit" cancelHref="/monitors/{data.monitor.id}" />
</div>
