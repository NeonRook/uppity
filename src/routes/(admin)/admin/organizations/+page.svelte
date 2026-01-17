<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Plus, Search, Users } from '@lucide/svelte';
	import Pagination from '$lib/components/pagination.svelte';
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
	<title>Organizations - Admin - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Organizations</h1>
		<Button href={resolve('/admin/organizations/new')}>
			<Plus class="mr-2 h-4 w-4" />
			New Organization
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-4">
				<div class="relative flex-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Search organizations..."
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
						<Table.Head>Slug</Table.Head>
						<Table.Head>Members</Table.Head>
						<Table.Head>Created</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.organizations as org (org.id)}
						<Table.Row class="cursor-pointer hover:bg-muted/50">
							<Table.Cell class="font-medium">
								<a href={resolve(`/admin/organizations/${org.id}`)} class="hover:underline">
									{org.name}
								</a>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{org.slug}</Table.Cell>
							<Table.Cell>
								<Badge variant="secondary">
									<Users class="mr-1 h-3 w-3" />
									{org.members.length}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{formatDateShort(org.createdAt)}</Table.Cell
							>
						</Table.Row>
					{/each}
					{#if data.organizations.length === 0}
						<Table.Row>
							<Table.Cell colspan={4} class="text-center text-muted-foreground">
								No organizations found
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
				itemName="organizations"
				onPageChange={(p) => (params.page = p)}
			/>
		</Card.Content>
	</Card.Root>
</div>
