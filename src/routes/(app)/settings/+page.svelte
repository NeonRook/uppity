<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Field from '$lib/components/ui/field';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import * as Table from '$lib/components/ui/table';
	import {
		User,
		Building2,
		Users,
		Mail,
		Crown,
		Shield,
		LoaderCircle,
		Plus,
		X,
		UserMinus,
		Check
	} from '@lucide/svelte';
	import { organization } from '$lib/auth-client';
	import { m } from '$lib/paraglide/messages.js';
	import { cancelInvitation, removeMember } from '$lib/remote/settings.remote';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();

	let loading = $state(false);
	let showCreateOrgDialog = $state(false);
	let showInviteDialog = $state(false);
	let showRemoveMemberDialog = $state(false);
	let memberToRemove = $state<{ id: string; name: string } | null>(null);
	let inviteRole = $state('member');
	let switchingOrg = $state(false);
	let cancellingInvitationId = $state<string | null>(null);
	let removingMember = $state(false);

	async function switchOrganization(orgId: string) {
		if (orgId === data.currentOrganization?.id) return;
		switchingOrg = true;
		try {
			await organization.setActive({ organizationId: orgId });
			window.location.reload();
		} catch (error) {
			console.error('Failed to switch organization:', error);
		} finally {
			switchingOrg = false;
		}
	}

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
</script>

<svelte:head>
	<title>{m.settings_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">{m.settings_title()}</h1>
		<p class="text-muted-foreground">{m.settings_subtitle()}</p>
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
				{#if form.profileUpdated}
					{m.settings_success_profile()}
				{:else if form.orgUpdated}
					{m.settings_success_org()}
				{:else if form.orgCreated}
					{m.settings_success_org_created()}
				{:else if form.inviteSent}
					{m.settings_success_invite()}
				{:else}
					{m.settings_success_default()}
				{/if}
			</AlertDescription>
		</Alert>
	{/if}

	<!-- Profile Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<User class="h-5 w-5" />
				{m.settings_profile()}
			</Card.Title>
			<Card.Description>{m.settings_profile_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateProfile"
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
					<Field.Label for="name">{m.common_name()}</Field.Label>
					<Input id="name" name="name" value={data.user.name} required disabled={loading} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="email">{m.common_email()}</Field.Label>
					<Input id="email" type="email" value={data.user.email} disabled />
					<Field.Description>{m.settings_email_readonly()}</Field.Description>
				</Field.Field>
				<Button type="submit" disabled={loading}>
					{#if loading}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					{m.settings_save_profile()}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Organization Section -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title class="flex items-center gap-2">
						<Building2 class="h-5 w-5" />
						{m.settings_organization()}
					</Card.Title>
					<Card.Description>{m.settings_org_desc()}</Card.Description>
				</div>
				<Button variant="outline" size="sm" onclick={() => (showCreateOrgDialog = true)}>
					<Plus class="mr-2 h-4 w-4" />
					{m.common_new()}
				</Button>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.organizations.length > 1}
				<Field.Field>
					<Field.Label>{m.org_switch()}</Field.Label>
					<div class="flex flex-wrap gap-2">
						{#each data.organizations as org (org.id)}
							{@const roleInfo = getRoleBadge(org.role)}
							{@const isActive = org.id === data.currentOrganization?.id}
							<Button
								variant={isActive ? 'default' : 'outline'}
								size="sm"
								onclick={() => switchOrganization(org.id)}
								disabled={switchingOrg}
							>
								{org.name}
								<Badge variant={isActive ? 'secondary' : roleInfo.variant} class="ml-2 text-xs">
									{roleInfo.label}
								</Badge>
							</Button>
						{/each}
					</div>
				</Field.Field>
			{/if}

			{#if data.currentOrganization && data.isAdmin}
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
						<Field.Label for="orgName">{m.settings_org_name()}</Field.Label>
						<Input
							id="orgName"
							name="name"
							value={data.currentOrganization.name}
							required
							disabled={loading}
						/>
					</Field.Field>
					<Button type="submit" disabled={loading}>
						{#if loading}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						{m.settings_update_org()}
					</Button>
				</form>
			{:else if data.currentOrganization}
				<Field.Field>
					<Field.Label>{m.settings_org_name()}</Field.Label>
					<p class="text-sm">{data.currentOrganization.name}</p>
				</Field.Field>
			{:else}
				<p class="text-sm text-muted-foreground">
					{m.org_no_org_message()}
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Members Section -->
	{#if data.currentOrganization}
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
	{/if}

	<!-- Danger Zone -->
	<Card.Root class="border-destructive/50">
		<Card.Header>
			<Card.Title class="text-destructive">{m.settings_danger_zone()}</Card.Title>
			<Card.Description>{m.settings_irreversible()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" disabled>{m.settings_delete_account()}</Button>
			<p class="mt-2 text-xs text-muted-foreground">
				{m.settings_delete_coming_soon()}
			</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- Create Organization Dialog -->
<AlertDialog.Root bind:open={showCreateOrgDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.settings_dialog_create_org()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.settings_dialog_create_org_desc()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			method="POST"
			action="?/createOrganization"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					showCreateOrgDialog = false;
					await update();
				};
			}}
		>
			<div class="space-y-4 py-4">
				<Field.Field>
					<Field.Label for="newOrgName">{m.settings_org_name()}</Field.Label>
					<Input
						id="newOrgName"
						name="name"
						placeholder={m.settings_dialog_org_placeholder()}
						required
						disabled={loading}
					/>
				</Field.Field>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button type="submit" disabled={loading}>
					{#if loading}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					{m.common_create()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

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
