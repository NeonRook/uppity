<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Plus, Search } from '@lucide/svelte';
	import Pagination from '$lib/components/pagination.svelte';
	import { useSearchParams } from 'runed/kit';
	import * as v from 'valibot';
	import { formatDateShort } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const searchSchema = v.object({
		search: v.optional(v.string(), ''),
		page: v.optional(v.pipe(v.unknown(), v.transform(Number)), 1)
	});

	const params = useSearchParams(searchSchema);

	const totalPages = $derived(Math.ceil(data.total / data.limit));
</script>

<svelte:head>
	<title>{m.admin_users_title()} - Admin - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">{m.admin_users_title()}</h1>
		<Button href={resolve('/admin/users/new')}>
			<Plus class="mr-2 h-4 w-4" />
			{m.admin_users_new()}
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-4">
				<div class="relative flex-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="search"
						placeholder={m.admin_users_search()}
						class="pl-9"
						bind:value={params.search}
						onchange={() => (params.page = 1)}
					/>
				</div>
			</div>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.admin_table_name()}</Table.Head>
						<Table.Head>{m.admin_table_email()}</Table.Head>
						<Table.Head>{m.admin_table_role()}</Table.Head>
						<Table.Head>{m.admin_table_status()}</Table.Head>
						<Table.Head>{m.admin_table_created()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.users as user (user.id)}
						<Table.Row class="cursor-pointer hover:bg-muted/50">
							<Table.Cell class="font-medium">
								<a href={resolve(`/admin/users/${user.id}`)} class="hover:underline">
									{user.name}
								</a>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{user.email}</Table.Cell>
							<Table.Cell>
								<Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
									{user.role === 'admin' ? m.admin_role_admin() : m.admin_role_user()}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								{#if user.banned}
									<Badge variant="destructive">{m.admin_users_banned()}</Badge>
								{:else}
									<Badge variant="outline">{m.common_active()}</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground"
								>{formatDateShort(user.createdAt)}</Table.Cell
							>
						</Table.Row>
					{/each}
					{#if data.users.length === 0}
						<Table.Row>
							<Table.Cell colspan={5} class="text-center text-muted-foreground">
								{m.admin_users_no_users()}
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
				itemName={m.items_users()}
				onPageChange={(p) => (params.page = p)}
			/>
		</Card.Content>
	</Card.Root>
</div>
