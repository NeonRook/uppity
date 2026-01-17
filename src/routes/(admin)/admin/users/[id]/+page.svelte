<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, ArrowLeft, Trash2, Ban, CircleCheck } from '@lucide/svelte';

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

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getRoleLabel(role: string | undefined): string {
		return roleOptions.find((r) => r.value === role)?.label || 'User';
	}
</script>

<svelte:head>
	<title>Edit User - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/users">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<h1 class="text-2xl font-bold">{data.user.name}</h1>
			<p class="text-muted-foreground">{data.user.email}</p>
		</div>
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
	</div>

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
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input id="name" name="name" bind:value={$form.name} disabled={$delayed} />
						{#if $errors.name}
							<p class="text-sm text-destructive">{$errors.name}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							bind:value={$form.email}
							disabled={$delayed}
						/>
						{#if $errors.email}
							<p class="text-sm text-destructive">{$errors.email}</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="role">Role</Label>
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
				</div>

				<div class="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
					<div>Created: {formatDate(data.user.createdAt)}</div>
					<div>Updated: {formatDate(data.user.updatedAt)}</div>
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
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="banReason">Reason (optional)</Label>
					<Textarea
						id="banReason"
						name="banReason"
						bind:value={banReason}
						placeholder="Enter a reason for the ban..."
					/>
				</div>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<Button type="submit" variant="destructive">Ban User</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Delete Dialog -->
<AlertDialog.Root bind:open={showDeleteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete User</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete {data.user.name}? This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form method="POST" action="?/delete">
				<Button type="submit" variant="destructive">Delete User</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
