<script lang="ts">
	import { resolve } from '$app/paths';
	import { superForm } from 'sveltekit-superforms';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, ArrowLeft, Trash2, UserPlus } from '@lucide/svelte';

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

	const roleOptions = [
		{ value: 'member', label: 'Member' },
		{ value: 'admin', label: 'Admin' },
		{ value: 'owner', label: 'Owner' }
	];

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
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
		return roleOptions.find((r) => r.value === role)?.label || 'Member';
	}

	function getUserLabel(userId: string): string {
		const user = data.availableUsers.find((u) => u.id === userId);
		return user ? `${user.name} (${user.email})` : 'Select a user...';
	}
</script>

<svelte:head>
	<title>Edit Organization - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/organizations">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-2xl font-bold">{data.org.name}</h1>
			<p class="text-muted-foreground">/{data.org.slug}</p>
		</div>
	</div>

	<!-- Organization Details -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Organization Details</Card.Title>
			<Card.Description>Update organization information</Card.Description>
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
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input id="name" name="name" bind:value={$form.name} disabled={$delayed} />
						{#if $errors.name}
							<p class="text-sm text-destructive">{$errors.name}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="slug">Slug</Label>
						<Input id="slug" name="slug" bind:value={$form.slug} disabled={$delayed} />
						{#if $errors.slug}
							<p class="text-sm text-destructive">{$errors.slug}</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="logo">Logo URL (optional)</Label>
					<Input
						id="logo"
						name="logo"
						type="url"
						bind:value={$form.logo}
						disabled={$delayed}
						placeholder="https://example.com/logo.png"
					/>
					{#if $errors.logo}
						<p class="text-sm text-destructive">{$errors.logo}</p>
					{/if}
				</div>

				<div class="text-sm text-muted-foreground">Created: {formatDate(data.org.createdAt)}</div>

				<div class="pt-4">
					<Button type="submit" disabled={$delayed}>
						{#if $delayed}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
							Saving...
						{:else}
							Save Changes
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
					<Card.Title>Members</Card.Title>
					<Card.Description>Manage organization members</Card.Description>
				</div>
				{#if data.availableUsers.length > 0}
					<Button size="sm" onclick={() => (showAddMemberDialog = true)}>
						<UserPlus class="mr-2 h-4 w-4" />
						Add Member
					</Button>
				{/if}
			</div>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Email</Table.Head>
						<Table.Head>Role</Table.Head>
						<Table.Head>Joined</Table.Head>
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
									{member.role}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{formatDate(member.createdAt)}</Table.Cell>
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
								No members yet
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
			<Card.Title class="text-destructive">Danger Zone</Card.Title>
			<Card.Description>Irreversible actions</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" onclick={() => (showDeleteDialog = true)}>
				<Trash2 class="mr-2 h-4 w-4" />
				Delete Organization
			</Button>
		</Card.Content>
	</Card.Root>
</div>

<!-- Add Member Dialog -->
<AlertDialog.Root bind:open={showAddMemberDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Add Member</AlertDialog.Title>
			<AlertDialog.Description>Add a user to this organization.</AlertDialog.Description>
		</AlertDialog.Header>
		<form method="POST" action="?/addMember">
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="userId">User</Label>
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
				</div>

				<div class="space-y-2">
					<Label for="role">Role</Label>
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
							{#each roleOptions as option (option.value)}
								<Select.Item value={option.value}>{option.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<Button type="submit" disabled={!selectedUserId}>Add Member</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Remove Member Dialog -->
<AlertDialog.Root open={!!memberToRemove} onOpenChange={(open) => !open && (memberToRemove = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove Member</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to remove {memberToRemove?.name} from this organization?
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form method="POST" action="?/removeMember">
				<input type="hidden" name="memberId" value={memberToRemove?.id || ''} />
				<Button type="submit" variant="destructive">Remove</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Delete Dialog -->
<AlertDialog.Root bind:open={showDeleteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete Organization</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete {data.org.name}? This action cannot be undone. All monitors,
				incidents, and other data associated with this organization will be permanently deleted.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form method="POST" action="?/delete">
				<Button type="submit" variant="destructive">Delete Organization</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
