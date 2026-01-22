<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { superForm } from 'sveltekit-superforms';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, Trash2, UserPlus } from '@lucide/svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import { formatDateShort } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';
	import { deleteOrganization } from '$lib/remote/admin.remote';

	let { data } = $props();

	const { form, errors, message, enhance, delayed } = superForm(
		untrack(() => data.form),
		{
			resetForm: false
		}
	);

	let showDeleteDialog = $state(false);
	let showAddMemberDialog = $state(false);
	let memberToRemove = $state<{ id: string; name: string } | null>(null);

	let selectedUserId = $state<string>('');
	let selectedRole = $state<string>('member');

	async function handleDelete() {
		await deleteOrganization({ organizationId: data.org.id });
		goto(resolve('/admin/organizations'));
	}

	function getRoleBadgeVariant(role: string) {
		switch (role) {
			case 'owner':
				return 'default';
			case 'admin':
				return 'secondary';
			default:
				return 'outline';
		}
	}

	function getRoleLabel(role: string): string {
		switch (role) {
			case 'owner':
				return m.role_owner();
			case 'admin':
				return m.role_admin();
			default:
				return m.role_member();
		}
	}

	function getUserLabel(userId: string): string {
		const user = data.availableUsers.find((u) => u.id === userId);
		return user ? `${user.name} (${user.email})` : m.admin_orgs_select_user();
	}
</script>

<svelte:head>
	<title>{m.admin_orgs_edit()} - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader
		backHref="/admin/organizations"
		title={data.org.name}
		description="/{data.org.slug}"
	/>

	<!-- Organization Details -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.admin_orgs_details()}</Card.Title>
			<Card.Description>{m.admin_orgs_details_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/update" use:enhance class="space-y-4">
				{#if $message}
					<Alert variant="destructive">
						<CircleAlert class="h-4 w-4" />
						<AlertDescription>{$message}</AlertDescription>
					</Alert>
				{/if}

				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="name">{m.common_name()}</Field.Label>
						<Input id="name" name="name" bind:value={$form.name} disabled={$delayed} />
						<Field.Error errors={$errors.name} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="slug">{m.admin_orgs_slug()}</Field.Label>
						<Input id="slug" name="slug" bind:value={$form.slug} disabled={$delayed} />
						<Field.Error errors={$errors.slug} />
					</Field.Field>
				</div>

				<Field.Field>
					<Field.Label for="logo">{m.admin_orgs_logo()}</Field.Label>
					<Input
						id="logo"
						name="logo"
						type="url"
						bind:value={$form.logo}
						disabled={$delayed}
						placeholder={m.admin_orgs_logo_placeholder()}
					/>
					<Field.Error errors={$errors.logo} />
				</Field.Field>

				<div class="text-sm text-muted-foreground">
					{m.common_created()}: {formatDateShort(data.org.createdAt)}
				</div>

				<div class="pt-4">
					<Button type="submit" disabled={$delayed}>
						{#if $delayed}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
							{m.admin_saving()}
						{:else}
							{m.admin_save_changes()}
						{/if}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Members -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title>{m.admin_orgs_members()}</Card.Title>
					<Card.Description>{m.admin_orgs_members_desc()}</Card.Description>
				</div>
				{#if data.availableUsers.length > 0}
					<Button size="sm" onclick={() => (showAddMemberDialog = true)}>
						<UserPlus class="mr-2 h-4 w-4" />
						{m.admin_orgs_add_member()}
					</Button>
				{/if}
			</div>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.admin_table_name()}</Table.Head>
						<Table.Head>{m.admin_table_email()}</Table.Head>
						<Table.Head>{m.admin_table_role()}</Table.Head>
						<Table.Head>{m.admin_table_joined()}</Table.Head>
						<Table.Head class="w-[50px]"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.org.members as member (member.id)}
						<Table.Row>
							<Table.Cell class="font-medium">
								<a href={resolve(`/admin/users/${member.user.id}`)} class="hover:underline">
									{member.user.name}
								</a>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{member.user.email}</Table.Cell>
							<Table.Cell>
								<Badge variant={getRoleBadgeVariant(member.role)}>
									{getRoleLabel(member.role)}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground"
								>{formatDateShort(member.createdAt)}</Table.Cell
							>
							<Table.Cell>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => (memberToRemove = { id: member.id, name: member.user.name })}
								>
									<Trash2 class="h-4 w-4 text-destructive" />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
					{#if data.org.members.length === 0}
						<Table.Row>
							<Table.Cell colspan={5} class="text-center text-muted-foreground">
								{m.admin_orgs_no_members()}
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<!-- Danger Zone -->
	<Card.Root class="border-destructive">
		<Card.Header>
			<Card.Title class="text-destructive">{m.settings_danger_zone()}</Card.Title>
			<Card.Description>{m.settings_irreversible()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" onclick={() => (showDeleteDialog = true)}>
				<Trash2 class="mr-2 h-4 w-4" />
				{m.admin_orgs_delete()}
			</Button>
		</Card.Content>
	</Card.Root>
</div>

<!-- Add Member Dialog -->
<AlertDialog.Root bind:open={showAddMemberDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.admin_orgs_add_member_title()}</AlertDialog.Title>
			<AlertDialog.Description>{m.admin_orgs_add_member_desc()}</AlertDialog.Description>
		</AlertDialog.Header>
		<form method="POST" action="?/addMember">
			<div class="space-y-4 py-4">
				<Field.Field>
					<Field.Label for="userId">{m.admin_role_user()}</Field.Label>
					<input type="hidden" name="userId" bind:value={selectedUserId} />
					<Select.Root
						type="single"
						name="userId"
						value={selectedUserId}
						onValueChange={(v) => (selectedUserId = v)}
					>
						<Select.Trigger class="w-full">
							{getUserLabel(selectedUserId)}
						</Select.Trigger>
						<Select.Content>
							{#each data.availableUsers as user (user.id)}
								<Select.Item value={user.id}>{user.name} ({user.email})</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<Field.Field>
					<Field.Label for="role">{m.common_role()}</Field.Label>
					<input type="hidden" name="role" bind:value={selectedRole} />
					<Select.Root
						type="single"
						name="role"
						value={selectedRole}
						onValueChange={(v) => (selectedRole = v)}
					>
						<Select.Trigger class="w-full">
							{getRoleLabel(selectedRole)}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="member">{m.role_member()}</Select.Item>
							<Select.Item value="admin">{m.role_admin()}</Select.Item>
							<Select.Item value="owner">{m.role_owner()}</Select.Item>
						</Select.Content>
					</Select.Root>
				</Field.Field>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button type="submit" disabled={!selectedUserId}>{m.admin_orgs_add_member()}</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Remove Member Dialog -->
<AlertDialog.Root open={!!memberToRemove} onOpenChange={(open) => !open && (memberToRemove = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.admin_orgs_remove_member_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.admin_orgs_remove_member_desc({ name: memberToRemove?.name ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<form method="POST" action="?/removeMember">
				<input type="hidden" name="memberId" value={memberToRemove?.id || ''} />
				<Button type="submit" variant="destructive">{m.common_remove()}</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<DeleteDialog
	open={showDeleteDialog}
	itemId={data.org.id}
	onOpenChange={(open) => (showDeleteDialog = open)}
	onDelete={handleDelete}
	title={m.admin_orgs_delete()}
	description={m.admin_orgs_delete_confirm({ name: data.org.name })}
/>
