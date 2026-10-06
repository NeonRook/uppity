<script lang="ts">
	import { resolve } from "$app/paths";
	import { CircleAlert, LoaderCircle, CircleCheck } from "@lucide/svelte";

	import { requestPasswordReset } from "#lib/auth-client.js";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let email = $state("");
	let error = $state("");
	let loading = $state(false);
	let submitted = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		loading = true;

		try {
			// The result is ignored so a failure looks like success, which prevents
			// user enumeration.
			await requestPasswordReset({ email, redirectTo: "/reset-password" });
			submitted = true;
		} catch {
			error = m.auth_login_error_unexpected();
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Forgot Password - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header class="space-y-1">
		<Card.Title class="text-2xl font-bold">{m.auth_forgot_title()}</Card.Title>
		<Card.Description>{m.auth_forgot_subtitle()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if submitted}
			<Alert>
				<CircleCheck class="h-4 w-4" />
				<AlertDescription>{m.auth_forgot_success()}</AlertDescription>
			</Alert>
		{:else}
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
						placeholder="name@example.com"
						bind:value={email}
						required
						disabled={loading}
					/>
				</Field.Field>

				<Button type="submit" class="w-full" disabled={loading}>
					{#if loading}
						<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
						{m.auth_forgot_submitting()}
					{:else}
						{m.auth_forgot_submit()}
					{/if}
				</Button>
			</form>
		{/if}
	</Card.Content>
	<Card.Footer>
		<div class="text-muted-foreground text-sm">
			<a href={resolve("login")} class="text-primary underline-offset-4 hover:underline"
				>{m.auth_forgot_back_to_login()}</a
			>
		</div>
	</Card.Footer>
</Card.Root>
