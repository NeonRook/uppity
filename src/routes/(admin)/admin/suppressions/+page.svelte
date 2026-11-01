<script lang="ts">
	import { enhance } from "$app/forms";

	import PageHeader from "#lib/components/page-header.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { formatDateShort } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data } = $props();

	const reasons = {
		bounce: m.admin_suppression_bounce,
		complaint: m.admin_suppression_complaint,
	};
</script>

<svelte:head>
	<title>{m.admin_suppression_title()} - Admin - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		backHref="/admin"
		title={m.admin_suppression_title()}
		description={m.admin_suppression_desc()}
	/>

	<form method="GET" class="flex max-w-md gap-2">
		<Input
			type="email"
			name="email"
			required
			autocomplete="off"
			aria-label={m.admin_suppression_email()}
			placeholder={m.admin_suppression_email()}
			value={data.email}
		/>
		<Button type="submit">{m.admin_suppression_search()}</Button>
	</form>

	{#if data.suppression}
		<Card.Root>
			<Card.Header>
				<div class="flex items-start justify-between gap-4">
					<div>
						<Card.Title>{data.suppression.email}</Card.Title>
						<Card.Description>
							{reasons[data.suppression.reason]({
								date: formatDateShort(data.suppression.suppressedAt),
							})}
							{m.admin_suppression_provider()}
						</Card.Description>
					</div>
					<form method="POST" action="?/lift" use:enhance>
						<input type="hidden" name="email" value={data.suppression.email} />
						<Button type="submit" variant="outline" size="sm">
							{m.admin_suppression_lift()}
						</Button>
					</form>
				</div>
			</Card.Header>
		</Card.Root>
	{:else if data.email}
		<p class="text-muted-foreground text-sm">{m.admin_suppression_none()}</p>
	{/if}
</div>
