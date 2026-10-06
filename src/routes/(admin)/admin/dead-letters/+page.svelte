<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import { CircleAlert, RotateCw } from "@lucide/svelte";

	import PageHeader from "#lib/components/page-header.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Table from "#lib/components/ui/table/index.js";
	import { formatDateTimeShort, formatRelativeTime } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getLocale } from "#lib/paraglide/runtime.js";

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{m.admin_dead_letter_title()} - Admin - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		backHref="/admin"
		title={m.admin_dead_letter_title()}
		description={m.admin_dead_letter_desc()}
	/>

	{#if form?.message}
		<Alert variant="destructive">
			<CircleAlert class="h-4 w-4" />
			<AlertDescription>{form.message}</AlertDescription>
		</Alert>
	{/if}

	<Card.Root>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.admin_table_name()}</Table.Head>
						<Table.Head>{m.admin_dead_letter_col_org()}</Table.Head>
						<Table.Head>{m.admin_dead_letter_col_error()}</Table.Head>
						<Table.Head>{m.admin_dead_letter_col_since()}</Table.Head>
						<Table.Head>{m.admin_dead_letter_col_next()}</Table.Head>
						<Table.Head />
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.monitors as mon (mon.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{mon.name}</Table.Cell>
							<Table.Cell>
								<a
									href={resolve(`admin/organizations/${mon.organizationId}`)}
									class="hover:underline">{mon.organizationName}</a
								>
							</Table.Cell>
							<Table.Cell
								class="text-muted-foreground max-w-sm truncate font-mono text-xs"
								title={mon.lastError}>{mon.lastError}</Table.Cell
							>
							<Table.Cell class="text-muted-foreground">
								{formatDateTimeShort(mon.deadLetteredAt)}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">
								{mon.nextCheckAt ? formatRelativeTime(mon.nextCheckAt, getLocale()) : "-"}
							</Table.Cell>
							<Table.Cell class="text-right">
								<form method="POST" action="?/reset" use:enhance>
									<input type="hidden" name="monitorId" value={mon.id} />
									<Button type="submit" variant="outline" size="sm">
										<RotateCw class="mr-2 h-4 w-4" />
										{m.admin_dead_letter_retry()}
									</Button>
								</form>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6} class="text-muted-foreground text-center">
								{m.admin_dead_letter_empty()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
