<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { signIn } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { AlertCircle, Loader2 } from '@lucide/svelte';

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
				error = result.error.message || 'Invalid email or password';
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
	<title>Login - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header class="space-y-1">
		<Card.Title class="text-2xl font-bold">Sign in</Card.Title>
		<Card.Description>Enter your email and password to access your account</Card.Description>
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
				<Input id="password" type="password" bind:value={password} required disabled={loading} />
			</div>

			<Button type="submit" class="w-full" disabled={loading}>
				{#if loading}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					Signing in...
				{:else}
					Sign in
				{/if}
			</Button>
		</form>
	</Card.Content>
	<Card.Footer class="flex flex-col space-y-4">
		<div class="text-sm text-muted-foreground">
			<a
				href={resolve('/forgot-password')}
				class="underline-offset-4 hover:text-primary hover:underline"
			>
				Forgot your password?
			</a>
		</div>
		<div class="text-sm text-muted-foreground">
			Don't have an account?
			<a href={resolve('/register')} class="text-primary underline-offset-4 hover:underline"
				>Sign up</a
			>
		</div>
	</Card.Footer>
</Card.Root>
