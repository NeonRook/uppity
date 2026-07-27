<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as pageState } from '$app/state';
	import Pagination from '$lib/components/pagination.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { formatDateTimeShort } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';
	import { ChevronDown, ChevronRight, Download } from '@lucide/svelte';

	let { data } = $props();

	let expanded = $state<string | null>(null);

	const totalPages = $derived(Math.ceil(data.total / data.limit));

	function targetHref(entry: (typeof data.entries)[number]): string | null {
		if (!entry.targetId) return null;
		if (entry.targetType === 'user') return `/admin/users/${entry.targetId}`;
		if (entry.targetType === 'organization') return `/admin/organizations/${entry.targetId}`;
		return null;
	}

	// Built by hand rather than via URLSearchParams: this is a throwaway string,
	// not reactive state, and constructing one trips svelte/prefer-svelte-reactivity.
	function goToPage(next: number) {
		const pairs = [...pageState.url.searchParams.entries()].filter(([key]) => key !== 'page');
		pairs.push(['page', String(next)]);
		const query = pairs
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');
		goto(`?${query}`);
	}
</script>

<svelte:head>
	<title>{m.admin_audit_title()} - Admin - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">{m.admin_audit_title()}</h1>
			<p class="text-muted-foreground">{m.admin_audit_desc()}</p>
		</div>
		<Button variant="outline" href="/admin/audit/export?{data.exportQuery}" data-sveltekit-reload>
			<Download class="mr-2 h-4 w-4" />
			{m.admin_audit_export()}
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<!-- A plain GET form: filters land in the URL, so a filtered view is a
			     shareable link and the export button inherits them for free. -->
			<form method="GET" class="flex flex-wrap items-end gap-3">
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-muted-foreground">{m.admin_audit_filter_action()}</span>
					<select name="action" class="h-9 rounded-md border bg-background px-2 text-sm">
						<option value="">{m.admin_audit_filter_all()}</option>
						{#each data.actions as action (action)}
							<option value={action} selected={pageState.url.searchParams.get('action') === action}>
								{action}
							</option>
						{/each}
					</select>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="text-muted-foreground">{m.admin_audit_filter_target_type()}</span>
					<select name="targetType" class="h-9 rounded-md border bg-background px-2 text-sm">
						<option value="">{m.admin_audit_filter_all()}</option>
						{#each data.targetTypes as targetType (targetType)}
							<option
								value={targetType}
								selected={pageState.url.searchParams.get('targetType') === targetType}
							>
								{targetType}
							</option>
						{/each}
					</select>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="text-muted-foreground">{m.admin_audit_filter_from()}</span>
					<input
						type="date"
						name="from"
						value={pageState.url.searchParams.get('from') ?? ''}
						class="h-9 rounded-md border bg-background px-2 text-sm"
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="text-muted-foreground">{m.admin_audit_filter_to()}</span>
					<input
						type="date"
						name="to"
						value={pageState.url.searchParams.get('to') ?? ''}
						class="h-9 rounded-md border bg-background px-2 text-sm"
					/>
				</label>

				<Button type="submit" size="sm">{m.admin_audit_filter_apply()}</Button>
				<Button variant="ghost" size="sm" href={resolve('/admin/audit')}>
					{m.admin_audit_filter_clear()}
				</Button>
			</form>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-8"></Table.Head>
						<Table.Head>{m.admin_audit_col_time()}</Table.Head>
						<Table.Head>{m.admin_audit_col_actor()}</Table.Head>
						<Table.Head>{m.admin_audit_col_action()}</Table.Head>
						<Table.Head>{m.admin_audit_col_target()}</Table.Head>
						<Table.Head>{m.admin_audit_col_ip()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.entries as entry (entry.id)}
						{@const href = targetHref(entry)}
						<Table.Row>
							<Table.Cell>
								{#if entry.metadata}
									<button
										type="button"
										class="text-muted-foreground"
										onclick={() => (expanded = expanded === entry.id ? null : entry.id)}
										aria-label={m.admin_audit_toggle_details()}
									>
										{#if expanded === entry.id}
											<ChevronDown class="h-4 w-4" />
										{:else}
											<ChevronRight class="h-4 w-4" />
										{/if}
									</button>
								{/if}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap text-muted-foreground">
								{formatDateTimeShort(entry.createdAt)}
							</Table.Cell>
							<Table.Cell class="text-sm">{entry.actorEmail}</Table.Cell>
							<Table.Cell><Badge variant="secondary">{entry.action}</Badge></Table.Cell>
							<Table.Cell class="text-sm">
								{#if href}
									<a {href} class="hover:underline">{entry.targetLabel ?? entry.targetId}</a>
								{:else}
									{entry.targetLabel ?? entry.targetId ?? '—'}
								{/if}
							</Table.Cell>
							<Table.Cell class="font-mono text-xs text-muted-foreground">
								{entry.ipAddress ?? '—'}
							</Table.Cell>
						</Table.Row>
						{#if expanded === entry.id && entry.metadata}
							<Table.Row>
								<Table.Cell colspan={6} class="bg-muted/40">
									<pre class="overflow-x-auto text-xs">{JSON.stringify(
											entry.metadata,
											null,
											2
										)}</pre>
								</Table.Cell>
							</Table.Row>
						{/if}
					{/each}
					{#if data.entries.length === 0}
						<Table.Row>
							<Table.Cell colspan={6} class="text-center text-muted-foreground">
								{m.admin_audit_empty()}
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>

			<Pagination
				page={data.page}
				{totalPages}
				limit={data.limit}
				total={data.total}
				itemName={m.items_audit_entries()}
				onPageChange={goToPage}
			/>
		</Card.Content>
	</Card.Root>
</div>
