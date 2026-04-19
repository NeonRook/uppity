<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Field from '$lib/components/ui/field';
	import { Badge } from '$lib/components/ui/badge';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		User,
		Building2,
		Crown,
		Shield,
		LoaderCircle,
		Plus,
		Check,
		CreditCard,
		Settings
	} from '@lucide/svelte';
	import { organization } from '$lib/auth-client';
	import { m } from '$lib/paraglide/messages.js';

	let { data, form } = $props();

	let loading = $state(false);
	let showCreateOrgDialog = $state(false);
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
				return { icon: Crown, variant: 'default' as const, label: m.role_owner() };
			case 'admin':
				return { icon: Shield, variant: 'secondary' as const, label: m.role_admin() };
			default:
				return { icon: User, variant: 'outline' as const, label: m.role_member() };
		}
	}
</script>

<svelte:head>
	<title>{m.settings_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 px-4 sm:px-0">
	<div>
		<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.settings_title()}</h1>
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
				{:else if form.orgCreated}
					{m.settings_success_org_created()}
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
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
			{#if data.organizations.length > 0}
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
			{:else}
				<p class="text-sm text-muted-foreground">
					{m.org_no_org_message()}
				</p>
			{/if}

			{#if data.currentOrganization}
				<div class="flex items-center justify-between rounded-lg border p-4">
					<div>
						<p class="font-medium">{data.currentOrganization.name}</p>
						<p class="text-sm text-muted-foreground">
							{data.organizations.find((o) => o.id === data.currentOrganization?.id)?.role ===
							'owner'
								? m.role_owner()
								: data.organizations.find((o) => o.id === data.currentOrganization?.id)?.role ===
									  'admin'
									? m.role_admin()
									: m.role_member()}
						</p>
					</div>
					<Button variant="outline" size="sm" href="/settings/organisation">
						<Settings class="mr-2 h-4 w-4" />
						{m.org_configure()}
					</Button>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Billing Section -->
	{#if data.currentOrganization && !data.selfHosted}
		<Card.Root>
			<Card.Header>
				<div class="flex items-center justify-between">
					<div>
						<Card.Title class="flex items-center gap-2">
							<CreditCard class="h-5 w-5" />
							{m.settings_billing()}
						</Card.Title>
						<Card.Description>{m.settings_billing_desc()}</Card.Description>
					</div>
					<Button variant="outline" size="sm" href="/settings/billing">
						{m.settings_manage_billing()}
					</Button>
				</div>
			</Card.Header>
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
