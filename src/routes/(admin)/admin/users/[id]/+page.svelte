<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, Trash2, Ban, CircleCheck } from '@lucide/svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import { formatDateTimeShort } from '$lib/format';

	let { data } = $props();

	const { form, errors, message, enhance, delayed } = superForm(
		untrack(() => data.form),
		{
			resetForm: false
		}
	);

	const roleOptions = [
		{ value: 'user', label: 'User' },
		{ value: 'admin', label: 'Admin' }
	];

	let banReason = $state('');
	let showDeleteDialog = $state(false);
	let showBanDialog = $state(false);

	function getRoleLabel(role: string | undefined): string {
		return roleOptions.find((r) => r.value === role)?.label || 'User';
	}
</script>

<svelte:head>
	<title>Edit User - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader backHref="/admin/users" title={data.user.name} description={data.user.email}>
		{#snippet actions()}
			<div class="flex items-center gap-2">
				{#if data.user.banned}
					<Badge variant="destructive">Banned</Badge>
				{:else}
					<Badge variant="outline">Active</Badge>
				{/if}
				<Badge variant={data.user.role === 'admin' ? 'default' : 'secondary'}>
					{data.user.role || 'user'}
				</Badge>
			</div>
		{/snippet}
	</PageHeader>

	<!-- User Details -->
	<Card.Root>
		<Card.Header>
			<Card.Title>User Details</Card.Title>
			<Card.Description>Update user information and role</Card.Description>
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
						<Field.Label for="name">Name</Field.Label>
						<Input id="name" name="name" bind:value={$form.name} disabled={$delayed} />
						<Field.Error errors={$errors.name} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="email">Email</Field.Label>
						<Input
							id="email"
							name="email"
							type="email"
							bind:value={$form.email}
							disabled={$delayed}
						/>
						<Field.Error errors={$errors.email} />
					</Field.Field>
				</div>

				<Field.Field>
					<Field.Label for="role">Role</Field.Label>
					<input type="hidden" name="role" bind:value={$form.role} />
					<Select.Root
						type="single"
						name="role"
						value={$form.role}
						onValueChange={(v) => ($form.role = v as 'user' | 'admin')}
						disabled={$delayed}
					>
						<Select.Trigger class="w-full">
							{getRoleLabel($form.role)}
						</Select.Trigger>
						<Select.Content>
							{#each roleOptions as option (option.value)}
								<Select.Item value={option.value}>{option.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<div class="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
					<div>Created: {formatDateTimeShort(data.user.createdAt)}</div>
					<div>Updated: {formatDateTimeShort(data.user.updatedAt)}</div>
				</div>

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

	<!-- Ban Status -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Account Status</Card.Title>
			<Card.Description>Manage user ban status</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.user.banned}
				<Alert variant="destructive">
					<Ban class="h-4 w-4" />
					<AlertDescription>
						This user is banned.
						{#if data.user.banReason}
							Reason: {data.user.banReason}
						{/if}
					</AlertDescription>
				</Alert>
				<form method="POST" action="?/unban">
					<Button type="submit" variant="outline">
						<CircleCheck class="mr-2 h-4 w-4" />
						Unban User
					</Button>
				</form>
			{:else}
				<p class="text-sm text-muted-foreground">
					This user is currently active. You can ban them to prevent login.
				</p>
				<Button variant="destructive" onclick={() => (showBanDialog = true)}>
					<Ban class="mr-2 h-4 w-4" />
					Ban User
				</Button>
			{/if}
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
				Delete User
			</Button>
		</Card.Content>
	</Card.Root>
</div>

<!-- Ban Dialog -->
<AlertDialog.Root bind:open={showBanDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Ban User</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to ban {data.user.name}? They will not be able to log in.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<form method="POST" action="?/ban">
			<div class="py-4">
				<Field.Field>
					<Field.Label for="banReason">Reason (optional)</Field.Label>
					<Textarea
						id="banReason"
						name="banReason"
						bind:value={banReason}
						placeholder="Enter a reason for the ban..."
					/>
				</Field.Field>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<Button type="submit" variant="destructive">Ban User</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<DeleteDialog
	open={showDeleteDialog}
	onOpenChange={(open) => (showDeleteDialog = open)}
	title="Delete User"
	description="Are you sure you want to delete {data.user.name}? This action cannot be undone."
/>
