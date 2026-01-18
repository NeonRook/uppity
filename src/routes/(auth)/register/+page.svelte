<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { signUp } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (password !== confirmPassword) {
			error = m.auth_register_error_mismatch();
			return;
		}

		if (password.length < 8) {
			error = m.auth_register_error_min_length();
			return;
		}

		loading = true;

		try {
			const result = await signUp.email({
				email,
				password,
				name
			});

			if (result.error) {
				error = result.error.message || m.auth_register_error_failed();
				loading = false;
				return;
			}

			goto(resolve('/dashboard'));
		} catch {
			error = m.auth_login_error_unexpected();
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Register - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header class="space-y-1">
		<Card.Title class="text-2xl font-bold">{m.auth_register_title()}</Card.Title>
		<Card.Description>{m.auth_register_subtitle()}</Card.Description>
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
				<Field.Label for="name">{m.common_name()}</Field.Label>
				<Input
					id="name"
					type="text"
					placeholder="John Doe"
					bind:value={name}
					required
					disabled={loading}
				/>
			</Field.Field>

			<Field.Field>
				<Field.Label for="email">{m.common_email()}</Field.Label>
				<Input
					id="email"
					type="email"
					placeholder="name@example.com"
					bind:value={email}
					required
					disabled={loading}
				/>
			</Field.Field>

			<Field.Field>
				<Field.Label for="password">{m.common_password()}</Field.Label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					required
					disabled={loading}
					minlength={8}
				/>
			</Field.Field>

			<Field.Field>
				<Field.Label for="confirmPassword">{m.auth_register_confirm_password()}</Field.Label>
				<Input
					id="confirmPassword"
					type="password"
					bind:value={confirmPassword}
					required
					disabled={loading}
				/>
			</Field.Field>

			<Button type="submit" class="w-full" disabled={loading}>
				{#if loading}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{m.auth_register_creating()}
				{:else}
					{m.auth_register_create()}
				{/if}
			</Button>
		</form>
	</Card.Content>
	<Card.Footer>
		<div class="text-sm text-muted-foreground">
			{m.auth_register_has_account()}
			<a href={resolve('/login')} class="text-primary underline-offset-4 hover:underline"
				>{m.auth_login_sign_in()}</a
			>
		</div>
	</Card.Footer>
</Card.Root>
