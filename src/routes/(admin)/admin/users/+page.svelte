<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Plus, Search, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { useSearchParams } from 'runed/kit';
	import * as v from 'valibot';
	import { formatDateShort } from '$lib/format';

	let { data } = $props();

	const searchSchema = v.object({
		search: v.optional(v.string(), ''),
		page: v.optional(v.pipe(v.unknown(), v.transform(Number)), 1)
	});

	const params = useSearchParams(searchSchema);

	const totalPages = $derived(Math.ceil(data.total / data.limit));
</script>

<svelte:head>
	<title>Users - Admin - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Users</h1>
		<Button href={resolve('/admin/users/new')}>
			<Plus class="mr-2 h-4 w-4" />
			New User
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-4">
				<div class="relative flex-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Search users..."
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
						<Table.Head>Name</Table.Head>
						<Table.Head>Email</Table.Head>
						<Table.Head>Role</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Created</Table.Head>
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
									{user.role || 'user'}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								{#if user.banned}
									<Badge variant="destructive">Banned</Badge>
								{:else}
									<Badge variant="outline">Active</Badge>
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
								No users found
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="mt-4 flex items-center justify-between">
					<p class="text-sm text-muted-foreground">
						Showing {(data.page - 1) * data.limit + 1} to {Math.min(
							data.page * data.limit,
							data.total
						)} of {data.total} users
					</p>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="icon"
							disabled={data.page <= 1}
							onclick={() => (params.page = data.page - 1)}
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
						<span class="text-sm">
							Page {data.page} of {totalPages}
						</span>
						<Button
							variant="outline"
							size="icon"
							disabled={data.page >= totalPages}
							onclick={() => (params.page = data.page + 1)}
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
