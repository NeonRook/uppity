<script lang="ts">
	import { CircleAlert, LoaderCircle } from "@lucide/svelte";

	import { signIn } from "#lib/auth-client.js";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/paraglide/messages.js";

	interface Props {
		placeholder: string;
		/** Runs after a successful sign-in. Returns an error message to stay on the form. */
		afterSignIn: () => Promise<string | void>;
	}

	let { placeholder, afterSignIn }: Props = $props();

	let email = $state("");
	let password = $state("");
	let error = $state("");
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		loading = true;

		try {
			const result = await signIn.email({ email, password });

			if (result.error) {
				error = result.error.message || m.auth_login_error_invalid();
				loading = false;
				return;
			}

			const failure = await afterSignIn();
			if (failure) {
				error = failure;
				loading = false;
			}
		} catch {
			error = m.auth_login_error_unexpected();
			loading = false;
		}
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	{#if error}
		<Alert variant="destructive">
			<CircleAlert class="h-4 w-4" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	<Field.Field>
		<Field.Label for="email">{m.common_email()}</Field.Label>
		<Input id="email" type="email" {placeholder} bind:value={email} required disabled={loading} />
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
