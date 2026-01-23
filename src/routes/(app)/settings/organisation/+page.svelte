<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Field from '$lib/components/ui/field';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import * as Table from '$lib/components/ui/table';
	import {
		Building2,
		Users,
		Mail,
		Crown,
		Shield,
		User,
		LoaderCircle,
		X,
		UserMinus,
		Check,
		AlertTriangle,
		Link as LinkIcon
	} from '@lucide/svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { m } from '$lib/paraglide/messages.js';
	import { cancelInvitation, removeMember, deleteOrganization } from '$lib/remote/settings.remote';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	let loading = $state(false);
	let showInviteDialog = $state(false);
	let showRemoveMemberDialog = $state(false);
	let showDeleteOrgDialog = $state(false);
	let memberToRemove = $state<{ id: string; name: string } | null>(null);
	let inviteRole = $state('member');
	let cancellingInvitationId = $state<string | null>(null);
	let removingMember = $state(false);
	let deletingOrg = $state(false);
	let deleteConfirmName = $state('');

	// Form state - use data directly, no local state needed since form submission reloads

	const baseUrl = browser ? window.location.origin : 'https://app.uppity.io';
	const canDelete = $derived(data.userOrgCount > 1 && data.isOwner);

	function getRoleBadge(role: string) {
		switch (role) {
			case 'owner':
				return { icon: Crown, variant: 'default' as const, label: m.role_owner() };
			case 'admin':
				return { icon: Shield, variant: 'secondary' as const, label: m.role_admin() };
			default:
				return { icon: User, variant: 'outline' as const, label: m.role_member() };
		}
	}

	async function handleCancelInvitation(invitationId: string) {
		cancellingInvitationId = invitationId;
		try {
			await cancelInvitation({ invitationId });
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to cancel invitation');
		} finally {
			cancellingInvitationId = null;
		}
	}

	async function handleRemoveMember() {
		if (!memberToRemove) return;
		removingMember = true;
		try {
			await removeMember({ memberId: memberToRemove.id });
			showRemoveMemberDialog = false;
			memberToRemove = null;
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to remove member');
		} finally {
			removingMember = false;
		}
	}

	async function handleDeleteOrganization() {
		if (deleteConfirmName !== data.currentOrganization.name) return;
		deletingOrg = true;
		try {
			await deleteOrganization({ organizationId: data.currentOrganization.id });
			showDeleteOrgDialog = false;
			toast.success('Organization deleted successfully');
			goto(resolve('/settings'));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to delete organization');
		} finally {
			deletingOrg = false;
		}
	}
</script>

<svelte:head>
	<title>{m.org_settings_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div>
		<Breadcrumb.Root class="mb-2">
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/settings">{m.nav_settings()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.settings_organization()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="text-3xl font-bold tracking-tight">{m.org_settings_title()}</h1>
		<p class="text-muted-foreground">{m.org_settings_subtitle()}</p>
	</div>

	{#if form?.error}
		<Alert variant="destructive">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	{#if form?.success}
		<Alert>
			<Check class="h-4 w-4" />
			<AlertDescription>
				{#if form.orgUpdated}
					{m.settings_success_org()}
				{:else if form.inviteSent}
					{m.settings_success_invite()}
				{:else}
					{m.settings_success_default()}
				{/if}
			</AlertDescription>
		</Alert>
	{/if}

	<!-- Organization Details -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Building2 class="h-5 w-5" />
				{m.org_details()}
			</Card.Title>
			<Card.Description>{m.org_details_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateOrganization"
				class="space-y-4"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
			>
				<Field.Field>
					<Field.Label for="name">{m.settings_org_name()}</Field.Label>
					<Input
						id="name"
						name="name"
						value={data.currentOrganization.name}
						required
						disabled={loading || !data.isAdmin}
					/>
				</Field.Field>

				<Field.Field>
					<Field.Label for="slug">{m.org_slug()}</Field.Label>
					<Input
						id="slug"
						name="slug"
						value={data.currentOrganization.slug}
						disabled={loading || !data.isOwner}
						pattern="[a-z0-9-]+"
					/>
					<Field.Description>
						{#if data.isOwner}
							{m.org_slug_desc()}
						{:else}
							Only owners can change the slug.
						{/if}
					</Field.Description>
					{#if data.currentOrganization.slug}
						<div class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
							<LinkIcon class="h-3 w-3" />
							<span
								>{m.org_slug_preview({ url: `${baseUrl}/${data.currentOrganization.slug}` })}</span
							>
						</div>
					{/if}
				</Field.Field>

				<Field.Field>
					<Field.Label for="logo">{m.org_logo()}</Field.Label>
					<Input
						id="logo"
						name="logo"
						type="url"
						value={data.currentOrganization.logo ?? ''}
						placeholder="https://example.com/logo.png"
						disabled={loading || !data.isAdmin}
					/>
					<Field.Description>{m.org_logo_desc()}</Field.Description>
				</Field.Field>

				<Field.Field>
					<Field.Label for="description">{m.org_description()}</Field.Label>
					<Textarea
						id="description"
						name="description"
						value={data.currentOrganization.description}
						placeholder="Brief description of your organization..."
						rows={3}
						disabled={loading || !data.isAdmin}
					/>
					<Field.Description>{m.org_description_desc()}</Field.Description>
				</Field.Field>

				{#if data.isAdmin}
					<Button type="submit" disabled={loading}>
						{#if loading}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						{m.common_save_changes()}
					</Button>
				{/if}
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Members Section -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title class="flex items-center gap-2">
						<Users class="h-5 w-5" />
						{m.settings_team_members()}
					</Card.Title>
					<Card.Description>
						{data.currentOrgMembers.length === 1
							? m.settings_member_count({ count: 1 })
							: m.settings_members_count({ count: data.currentOrgMembers.length })}
					</Card.Description>
				</div>
				{#if data.isAdmin}
					<Button variant="outline" size="sm" onclick={() => (showInviteDialog = true)}>
						<Mail class="mr-2 h-4 w-4" />
						{m.common_invite()}
					</Button>
				{/if}
			</div>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.common_name()}</Table.Head>
						<Table.Head>{m.common_email()}</Table.Head>
						<Table.Head>{m.common_role()}</Table.Head>
						{#if data.isOwner}
							<Table.Head class="w-12.5"></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.currentOrgMembers as member (member.id)}
						{@const roleInfo = getRoleBadge(member.role)}
						<Table.Row>
							<Table.Cell class="font-medium">
								{member.name}
								{#if member.id === data.user.id}
									<span class="ml-2 text-xs text-muted-foreground">{m.common_you()}</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{member.email}</Table.Cell>
							<Table.Cell>
								<Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>
							</Table.Cell>
							{#if data.isOwner}
								<Table.Cell>
									{#if member.id !== data.user.id && member.role !== 'owner'}
										<Button
											variant="ghost"
											size="icon"
											onclick={() => {
												memberToRemove = { id: member.id, name: member.name };
												showRemoveMemberDialog = true;
											}}
										>
											<UserMinus class="h-4 w-4" />
										</Button>
									{/if}
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>

			{#if data.pendingInvitations.length > 0}
				<div class="mt-6">
					<h4 class="mb-2 text-sm font-medium">{m.settings_pending_invitations()}</h4>
					<div class="space-y-2">
						{#each data.pendingInvitations as inv (inv.id)}
							<div class="flex items-center justify-between rounded-md border p-3 text-sm">
								<div>
									<span>{inv.email}</span>
									<Badge variant="outline" class="ml-2">{inv.role}</Badge>
								</div>
								{#if data.isAdmin}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => handleCancelInvitation(inv.id)}
										disabled={cancellingInvitationId === inv.id}
									>
										{#if cancellingInvitationId === inv.id}
											<LoaderCircle class="h-4 w-4 animate-spin" />
										{:else}
											<X class="h-4 w-4" />
										{/if}
									</Button>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Danger Zone -->
	{#if data.isOwner}
		<Card.Root class="border-destructive/50">
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-destructive">
					<AlertTriangle class="h-5 w-5" />
					{m.settings_danger_zone()}
				</Card.Title>
				<Card.Description>{m.settings_irreversible()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="space-y-4">
					<div>
						<h4 class="font-medium">{m.org_delete()}</h4>
						<p class="text-sm text-muted-foreground">{m.org_delete_desc()}</p>
					</div>
					<Button
						variant="destructive"
						onclick={() => (showDeleteOrgDialog = true)}
						disabled={!canDelete}
					>
						{m.org_delete()}
					</Button>
					{#if !canDelete && data.isOwner}
						<p class="text-xs text-muted-foreground">
							You must be a member of at least one organization. Create another organization before
							deleting this one.
						</p>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<!-- Invite Member Dialog -->
<AlertDialog.Root bind:open={showInviteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.settings_dialog_invite()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.settings_dialog_invite_desc()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			method="POST"
			action="?/inviteMember"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					showInviteDialog = false;
					await update();
				};
			}}
		>
			<div class="space-y-4 py-4">
				<Field.Field>
					<Field.Label for="inviteEmail">{m.common_email()}</Field.Label>
					<Input
						id="inviteEmail"
						name="email"
						type="email"
						placeholder={m.settings_dialog_email_placeholder()}
						required
						disabled={loading}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="inviteRole">{m.common_role()}</Field.Label>
					<Select.Root
						type="single"
						name="role"
						value={inviteRole}
						onValueChange={(v) => (inviteRole = v)}
					>
						<Select.Trigger class="w-full">
							{inviteRole === 'admin' ? m.role_admin() : m.role_member()}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="member">{m.role_member()}</Select.Item>
							<Select.Item value="admin">{m.role_admin()}</Select.Item>
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="role" value={inviteRole} />
				</Field.Field>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button type="submit" disabled={loading}>
					{#if loading}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					{m.settings_dialog_send_invite()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Remove Member Dialog -->
<AlertDialog.Root bind:open={showRemoveMemberDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.settings_dialog_remove_member()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.settings_dialog_remove_desc({ name: memberToRemove?.name ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (memberToRemove = null)}
				>{m.common_cancel()}</AlertDialog.Cancel
			>
			<Button onclick={handleRemoveMember} variant="destructive" disabled={removingMember}>
				{#if removingMember}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				{m.common_remove()}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Delete Organization Dialog -->
<AlertDialog.Root bind:open={showDeleteOrgDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-destructive">{m.org_delete()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.org_delete_desc()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="space-y-4 py-4">
			<p class="text-sm">
				{m.org_delete_confirm({ name: data.currentOrganization.name })}
			</p>
			<Input
				bind:value={deleteConfirmName}
				placeholder={data.currentOrganization.name}
				disabled={deletingOrg}
			/>
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (deleteConfirmName = '')}
				>{m.common_cancel()}</AlertDialog.Cancel
			>
			<Button
				variant="destructive"
				disabled={deletingOrg || deleteConfirmName !== data.currentOrganization.name}
				onclick={handleDeleteOrganization}
			>
				{#if deletingOrg}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				{m.common_delete()}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
