<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { signUp } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { AlertCircle, Loader2 } from '@lucide/svelte';

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
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
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
				error = result.error.message || 'Failed to create account';
				loading = false;
				return;
			}

			goto(resolve('/dashboard'));
		} catch {
			error = 'An unexpected error occurred';
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Register - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header class="space-y-1">
		<Card.Title class="text-2xl font-bold">Create an account</Card.Title>
		<Card.Description>Enter your details to get started</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={handleSubmit} class="space-y-4">
			{#if error}
				<Alert variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			{/if}

			<div class="space-y-2">
				<Label for="name">Name</Label>
				<Input
					id="name"
					type="text"
					placeholder="John Doe"
					bind:value={name}
					required
					disabled={loading}
				/>
			</div>

			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input
					id="email"
					type="email"
					placeholder="name@example.com"
					bind:value={email}
					required
					disabled={loading}
				/>
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					required
					disabled={loading}
					minlength={8}
				/>
			</div>

			<div class="space-y-2">
				<Label for="confirmPassword">Confirm Password</Label>
				<Input
					id="confirmPassword"
					type="password"
					bind:value={confirmPassword}
					required
					disabled={loading}
				/>
			</div>

			<Button type="submit" class="w-full" disabled={loading}>
				{#if loading}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					Creating account...
				{:else}
					Create account
				{/if}
			</Button>
		</form>
	</Card.Content>
	<Card.Footer>
		<div class="text-sm text-muted-foreground">
			Already have an account?
			<a href={resolve('/login')} class="text-primary underline-offset-4 hover:underline">Sign in</a
			>
		</div>
	</Card.Footer>
</Card.Root>
