<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
	import { m } from '$lib/paraglide/messages.js';
	import { deleteUser } from '$lib/remote/admin.remote';

	let { data } = $props();

	const { form, errors, message, enhance, delayed } = superForm(
		untrack(() => data.form),
		{
			resetForm: false
		}
	);

	let banReason = $state('');
	let showDeleteDialog = $state(false);
	let showBanDialog = $state(false);

	async function handleDelete() {
		await deleteUser({ userId: data.user.id });
		goto(resolve('/admin/users'));
	}

	function getRoleLabel(role: string | undefined): string {
		return role === 'admin' ? m.admin_role_admin() : m.admin_role_user();
	}
</script>

<svelte:head>
	<title>{m.admin_users_edit()} - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader backHref="/admin/users" title={data.user.name} description={data.user.email}>
		{#snippet actions()}
			<div class="flex items-center gap-2">
				{#if data.user.banned}
					<Badge variant="destructive">{m.admin_users_banned()}</Badge>
				{:else}
					<Badge variant="outline">{m.common_active()}</Badge>
				{/if}
				<Badge variant={data.user.role === 'admin' ? 'default' : 'secondary'}>
					{data.user.role === 'admin' ? m.admin_role_admin() : m.admin_role_user()}
				</Badge>
			</div>
		{/snippet}
	</PageHeader>

	<!-- User Details -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.admin_users_details()}</Card.Title>
			<Card.Description>{m.admin_users_details_desc()}</Card.Description>
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
						<Field.Label for="email">{m.common_email()}</Field.Label>
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
					<Field.Label for="role">{m.common_role()}</Field.Label>
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
							<Select.Item value="user">{m.admin_role_user()}</Select.Item>
							<Select.Item value="admin">{m.admin_role_admin()}</Select.Item>
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<div class="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
					<div>{m.common_created()}: {formatDateTimeShort(data.user.createdAt)}</div>
					<div>{m.common_updated()}: {formatDateTimeShort(data.user.updatedAt)}</div>
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

	<!-- Ban Status -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.admin_users_account_status()}</Card.Title>
			<Card.Description>{m.admin_users_account_status_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.user.banned}
				<Alert variant="destructive">
					<Ban class="h-4 w-4" />
					<AlertDescription>
						{m.admin_users_user_banned()}
						{#if data.user.banReason}
							{m.admin_users_ban_reason({ reason: data.user.banReason })}
						{/if}
					</AlertDescription>
				</Alert>
				<form method="POST" action="?/unban">
					<Button type="submit" variant="outline">
						<CircleCheck class="mr-2 h-4 w-4" />
						{m.admin_users_unban()}
					</Button>
				</form>
			{:else}
				<p class="text-sm text-muted-foreground">
					{m.admin_users_user_active_desc()}
				</p>
				<Button variant="destructive" onclick={() => (showBanDialog = true)}>
					<Ban class="mr-2 h-4 w-4" />
					{m.admin_users_ban()}
				</Button>
			{/if}
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
				{m.admin_users_delete()}
			</Button>
		</Card.Content>
	</Card.Root>
</div>

<!-- Ban Dialog -->
<AlertDialog.Root bind:open={showBanDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.admin_users_ban_dialog_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.admin_users_ban_dialog_desc({ name: data.user.name })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<form method="POST" action="?/ban">
			<div class="py-4">
				<Field.Field>
					<Field.Label for="banReason">{m.admin_users_ban_reason_label()}</Field.Label>
					<Textarea
						id="banReason"
						name="banReason"
						bind:value={banReason}
						placeholder={m.admin_users_ban_reason_placeholder()}
					/>
				</Field.Field>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button type="submit" variant="destructive">{m.admin_users_ban()}</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<DeleteDialog
	open={showDeleteDialog}
	itemId={data.user.id}
	onOpenChange={(open) => (showDeleteDialog = open)}
	onDelete={handleDelete}
	title={m.admin_users_delete()}
	description={m.admin_users_delete_confirm({ name: data.user.name })}
/>
