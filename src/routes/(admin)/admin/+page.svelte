<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Users, Building2, Monitor, TriangleAlert } from '@lucide/svelte';
	import { formatDateShort } from '$lib/format';
	import StatCard from '$lib/components/stat-card.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>{m.admin_dashboard()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="text-2xl font-bold">{m.admin_dashboard()}</h1>

	<!-- Stats Cards -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<StatCard title={m.admin_total_users()} value={data.stats.totalUsers} icon={Users} />
		<StatCard title={m.admin_total_orgs()} value={data.stats.totalOrganizations} icon={Building2} />
		<StatCard title={m.admin_total_monitors()} value={data.stats.totalMonitors} icon={Monitor} />
		<StatCard
			title={m.admin_total_incidents()}
			value={data.stats.totalIncidents}
			icon={TriangleAlert}
		/>
	</div>

	<!-- Recent Activity -->
	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Recent Users -->
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.admin_recent_users()}</Card.Title>
				<Card.Description>{m.admin_recent_users_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.admin_table_name()}</Table.Head>
							<Table.Head>{m.admin_table_email()}</Table.Head>
							<Table.Head>{m.admin_table_joined()}</Table.Head>
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
								<Table.Cell class="text-muted-foreground"
									>{formatDateShort(user.createdAt)}</Table.Cell
								>
							</Table.Row>
						{/each}
						{#if data.stats.recentUsers.length === 0}
							<Table.Row>
								<Table.Cell colspan={3} class="text-center text-muted-foreground">
									{m.admin_no_users()}
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
				<Card.Title>{m.admin_recent_orgs()}</Card.Title>
				<Card.Description>{m.admin_recent_orgs_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.admin_table_name()}</Table.Head>
							<Table.Head>{m.admin_table_slug()}</Table.Head>
							<Table.Head>{m.admin_table_created()}</Table.Head>
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
								<Table.Cell class="text-muted-foreground"
									>{formatDateShort(org.createdAt)}</Table.Cell
								>
							</Table.Row>
						{/each}
						{#if data.stats.recentOrganizations.length === 0}
							<Table.Row>
								<Table.Cell colspan={3} class="text-center text-muted-foreground">
									{m.admin_no_orgs()}
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	</div>
</div>
