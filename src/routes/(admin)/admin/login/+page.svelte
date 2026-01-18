<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { signIn, signOut, getSession } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, ShieldCheck } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			const result = await signIn.email({
				email,
				password
			});

			if (result.error) {
				error = result.error.message || m.auth_login_error_invalid();
				loading = false;
				return;
			}

			// Verify user has admin role
			const session = await getSession();
			if (session.data?.user?.role !== 'admin') {
				await signOut();
				error = m.admin_login_error_access();
				loading = false;
				return;
			}

			goto(resolve('/admin'));
		} catch {
			error = m.auth_login_error_unexpected();
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{m.admin_login_title()} - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header class="space-y-4">
		<div class="flex justify-center">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"
			>
				<ShieldCheck class="h-6 w-6" />
			</div>
		</div>
		<div class="space-y-1 text-center">
			<Card.Title class="text-2xl font-bold">{m.admin_login_title()}</Card.Title>
			<Card.Description>{m.admin_login_subtitle()}</Card.Description>
		</div>
	</Card.Header>
	<Card.Content>
		<form onsubmit={handleSubmit} class="space-y-4">
			{#if error}
				<Alert variant="destructive">
					<CircleAlert class="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			{/if}

			<Field.Field>
				<Field.Label for="email">{m.common_email()}</Field.Label>
				<Input
					id="email"
					type="email"
					placeholder="admin@example.com"
					bind:value={email}
					required
					disabled={loading}
				/>
			</Field.Field>

			<Field.Field>
				<Field.Label for="password">{m.common_password()}</Field.Label>
				<Input id="password" type="password" bind:value={password} required disabled={loading} />
			</Field.Field>

			<Button type="submit" class="w-full" disabled={loading}>
				{#if loading}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{m.auth_login_signing_in()}
				{:else}
					{m.auth_login_sign_in()}
				{/if}
			</Button>
		</form>
	</Card.Content>
</Card.Root>
