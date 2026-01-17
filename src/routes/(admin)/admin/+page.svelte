<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Users, Building2, Monitor, TriangleAlert } from '@lucide/svelte';

	let { data } = $props();

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Admin Dashboard - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="text-2xl font-bold">Dashboard</h1>

	<!-- Stats Cards -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Total Users</Card.Title>
				<Users class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.totalUsers}</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Total Organizations</Card.Title>
				<Building2 class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.totalOrganizations}</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Total Monitors</Card.Title>
				<Monitor class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.totalMonitors}</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Total Incidents</Card.Title>
				<TriangleAlert class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{data.stats.totalIncidents}</div>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Recent Activity -->
	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Recent Users -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Recent Users</Card.Title>
				<Card.Description>Latest registered users</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Email</Table.Head>
							<Table.Head>Joined</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.stats.recentUsers as user (user.id)}
							<Table.Row>
								<Table.Cell class="font-medium">
									<a href={resolve(`/admin/users/${user.id}`)} class="hover:underline">
										{user.name}
									</a>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">{user.email}</Table.Cell>
								<Table.Cell class="text-muted-foreground">{formatDate(user.createdAt)}</Table.Cell>
							</Table.Row>
						{/each}
						{#if data.stats.recentUsers.length === 0}
							<Table.Row>
								<Table.Cell colspan={3} class="text-center text-muted-foreground">
									No users yet
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		<!-- Recent Organizations -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Recent Organizations</Card.Title>
				<Card.Description>Latest created organizations</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Slug</Table.Head>
							<Table.Head>Created</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.stats.recentOrganizations as org (org.id)}
							<Table.Row>
								<Table.Cell class="font-medium">
									<a href={resolve(`/admin/organizations/${org.id}`)} class="hover:underline">
										{org.name}
									</a>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">{org.slug}</Table.Cell>
								<Table.Cell class="text-muted-foreground">{formatDate(org.createdAt)}</Table.Cell>
							</Table.Row>
						{/each}
						{#if data.stats.recentOrganizations.length === 0}
							<Table.Row>
								<Table.Cell colspan={3} class="text-center text-muted-foreground">
									No organizations yet
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	</div>
</div>
