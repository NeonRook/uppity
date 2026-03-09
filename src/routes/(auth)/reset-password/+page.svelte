<script lang="ts">
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';
	import { resetPassword } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, CircleCheck } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';

	let newPassword = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);
	let success = $state(false);

	const token = $derived($page.url.searchParams.get('token'));

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (newPassword.length < 8) {
			error = m.auth_reset_error_min_length();
			return;
		}

		if (newPassword !== confirmPassword) {
			error = m.auth_reset_error_mismatch();
			return;
		}

		loading = true;

		try {
			const result = await resetPassword({
				newPassword,
				token: token!
			});

			if (result.error) {
				error = result.error.message || m.auth_reset_error_failed();
				loading = false;
				return;
			}

			success = true;
		} catch {
			error = m.auth_reset_error_failed();
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header class="space-y-1">
		<Card.Title class="text-2xl font-bold">{m.auth_reset_title()}</Card.Title>
		<Card.Description>{m.auth_reset_subtitle()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if !token}
			<Alert variant="destructive">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{m.auth_reset_error_invalid_token()}</AlertDescription>
			</Alert>
		{:else if success}
			<div class="space-y-4">
				<Alert>
					<CircleCheck class="h-4 w-4" />
					<AlertDescription>{m.auth_reset_success()}</AlertDescription>
				</Alert>
				<Button href={resolve('/login')} class="w-full">
					{m.auth_reset_go_to_login()}
				</Button>
			</div>
		{:else}
			<form onsubmit={handleSubmit} class="space-y-4">
				{#if error}
					<Alert variant="destructive">
						<CircleAlert class="h-4 w-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				{/if}

				<Field.Field>
					<Field.Label for="newPassword">{m.auth_reset_new_password()}</Field.Label>
					<Input
						id="newPassword"
						type="password"
						bind:value={newPassword}
						required
						disabled={loading}
						minlength={8}
					/>
				</Field.Field>

				<Field.Field>
					<Field.Label for="confirmPassword">{m.auth_reset_confirm_password()}</Field.Label>
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
						{m.auth_reset_submitting()}
					{:else}
						{m.auth_reset_submit()}
					{/if}
				</Button>
			</form>
		{/if}
	</Card.Content>
	<Card.Footer>
		<div class="text-sm text-muted-foreground">
			<a href={resolve('/login')} class="text-primary underline-offset-4 hover:underline">
				{m.auth_forgot_back_to_login()}
			</a>
		</div>
	</Card.Footer>
</Card.Root>
