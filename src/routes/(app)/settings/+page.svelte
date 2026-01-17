<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
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

	let { data, form } = $props();

	let loading = $state(false);
	let showCreateOrgDialog = $state(false);
	let showInviteDialog = $state(false);
	let showRemoveMemberDialog = $state(false);
	let memberToRemove = $state<{ id: string; name: string } | null>(null);
	let inviteRole = $state('member');
	let switchingOrg = $state(false);

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
				return { icon: Crown, variant: 'default' as const, label: 'Owner' };
			case 'admin':
				return { icon: Shield, variant: 'secondary' as const, label: 'Admin' };
			default:
				return { icon: User, variant: 'outline' as const, label: 'Member' };
		}
	}
</script>

<svelte:head>
	<title>Settings - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Settings</h1>
		<p class="text-muted-foreground">Manage your account and organization settings</p>
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
					Profile updated successfully.
				{:else if form.orgUpdated}
					Organization updated successfully.
				{:else if form.orgCreated}
					Organization created successfully. Switch to it below.
				{:else if form.inviteSent}
					Invitation sent successfully.
				{:else if form.invitationCancelled}
					Invitation cancelled.
				{:else if form.memberRemoved}
					Member removed from organization.
				{:else}
					Changes saved successfully.
				{/if}
			</AlertDescription>
		</Alert>
	{/if}

	<!-- Profile Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<User class="h-5 w-5" />
				Profile
			</Card.Title>
			<Card.Description>Manage your personal information</Card.Description>
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
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" name="name" value={data.user.name} required disabled={loading} />
				</div>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" type="email" value={data.user.email} disabled />
					<p class="text-xs text-muted-foreground">Email cannot be changed</p>
				</div>
				<Button type="submit" disabled={loading}>
					{#if loading}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Save Profile
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
						Organization
					</Card.Title>
					<Card.Description>Manage your current organization</Card.Description>
				</div>
				<Button variant="outline" size="sm" onclick={() => (showCreateOrgDialog = true)}>
					<Plus class="mr-2 h-4 w-4" />
					New
				</Button>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.organizations.length > 1}
				<div class="space-y-2">
					<Label>Switch Organization</Label>
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
				</div>
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
					<div class="space-y-2">
						<Label for="orgName">Organization Name</Label>
						<Input
							id="orgName"
							name="name"
							value={data.currentOrganization.name}
							required
							disabled={loading}
						/>
					</div>
					<Button type="submit" disabled={loading}>
						{#if loading}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						Update Organization
					</Button>
				</form>
			{:else if data.currentOrganization}
				<div class="space-y-2">
					<Label>Organization Name</Label>
					<p class="text-sm">{data.currentOrganization.name}</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">
					No organization selected. Create or join an organization to continue.
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
							Team Members
						</Card.Title>
						<Card.Description>
							{data.currentOrgMembers.length} member{data.currentOrgMembers.length !== 1 ? 's' : ''}
						</Card.Description>
					</div>
					{#if data.isAdmin}
						<Button variant="outline" size="sm" onclick={() => (showInviteDialog = true)}>
							<Mail class="mr-2 h-4 w-4" />
							Invite
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
							{#if data.isOwner}
								<Table.Head class="w-12.5"></Table.Head>
							{/if}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.currentOrgMembers as m (m.id)}
							{@const roleInfo = getRoleBadge(m.role)}
							<Table.Row>
								<Table.Cell class="font-medium">
									{m.name}
									{#if m.id === data.user.id}
										<span class="ml-2 text-xs text-muted-foreground">(You)</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">{m.email}</Table.Cell>
								<Table.Cell>
									<Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>
								</Table.Cell>
								{#if data.isOwner}
									<Table.Cell>
										{#if m.id !== data.user.id && m.role !== 'owner'}
											<Button
												variant="ghost"
												size="icon"
												onclick={() => {
													memberToRemove = { id: m.id, name: m.name };
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
						<h4 class="mb-2 text-sm font-medium">Pending Invitations</h4>
						<div class="space-y-2">
							{#each data.pendingInvitations as inv (inv.id)}
								<div class="flex items-center justify-between rounded-md border p-3 text-sm">
									<div>
										<span>{inv.email}</span>
										<Badge variant="outline" class="ml-2">{inv.role}</Badge>
									</div>
									{#if data.isAdmin}
										<form method="POST" action="?/cancelInvitation" use:enhance>
											<input type="hidden" name="invitationId" value={inv.id} />
											<Button type="submit" variant="ghost" size="sm">
												<X class="h-4 w-4" />
											</Button>
										</form>
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
			<Card.Title class="text-destructive">Danger Zone</Card.Title>
			<Card.Description>Irreversible actions</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" disabled>Delete Account</Button>
			<p class="mt-2 text-xs text-muted-foreground">
				Account deletion will be available in a future update.
			</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- Create Organization Dialog -->
<AlertDialog.Root bind:open={showCreateOrgDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Create Organization</AlertDialog.Title>
			<AlertDialog.Description>
				Create a new organization to manage monitors and team members.
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
				<div class="space-y-2">
					<Label for="newOrgName">Organization Name</Label>
					<Input id="newOrgName" name="name" placeholder="My Company" required disabled={loading} />
				</div>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<Button type="submit" disabled={loading}>
					{#if loading}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Create
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Invite Member Dialog -->
<AlertDialog.Root bind:open={showInviteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Invite Team Member</AlertDialog.Title>
			<AlertDialog.Description>
				Send an invitation to join your organization.
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
				<div class="space-y-2">
					<Label for="inviteEmail">Email Address</Label>
					<Input
						id="inviteEmail"
						name="email"
						type="email"
						placeholder="teammate@example.com"
						required
						disabled={loading}
					/>
				</div>
				<div class="space-y-2">
					<Label for="inviteRole">Role</Label>
					<Select.Root
						type="single"
						name="role"
						value={inviteRole}
						onValueChange={(v) => (inviteRole = v)}
					>
						<Select.Trigger class="w-full">
							{inviteRole === 'admin' ? 'Admin' : 'Member'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="member">Member</Select.Item>
							<Select.Item value="admin">Admin</Select.Item>
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="role" value={inviteRole} />
				</div>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<Button type="submit" disabled={loading}>
					{#if loading}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Send Invitation
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Remove Member Dialog -->
<AlertDialog.Root bind:open={showRemoveMemberDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove Member</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to remove {memberToRemove?.name} from the organization? They will lose access
				to all monitors and data.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (memberToRemove = null)}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/removeMember"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showRemoveMemberDialog = false;
						memberToRemove = null;
						await update();
					};
				}}
			>
				<input type="hidden" name="memberId" value={memberToRemove?.id} />
				<Button type="submit" variant="destructive" disabled={loading}>
					{#if loading}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Remove
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
