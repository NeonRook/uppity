<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { CircleAlert, LoaderCircle } from "@lucide/svelte";

	import { signUp } from "#lib/auth-client.js";
	import Turnstile from "#lib/components/turnstile.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { TURNSTILE_TOKEN_HEADER } from "#lib/constants/turnstile.js";
	import { m } from "#lib/paraglide/messages.js";
	import { sameOriginPath } from "#lib/utils/same-origin-path.js";

	let { data } = $props();

	// Same-origin only, so the parameter cannot send a fresh session elsewhere.
	const redirectTo = $derived(
		sameOriginPath(page.url.searchParams.get("redirectTo"), page.url.origin),
	);

	let name = $state("");
	let email = $state("");
	let password = $state("");
	let confirmPassword = $state("");
	let error = $state("");
	let loading = $state(false);
	let turnstile = $state<Turnstile>();

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = "";

		if (password !== confirmPassword) {
			error = m.auth_register_error_mismatch();
			return;
		}

		loading = true;

		try {
			const result = await signUp.email(
				{ email, password, name },
				{ headers: { [TURNSTILE_TOKEN_HEADER]: turnstile?.token() ?? "" } },
			);

			if (result.error) {
				error = result.error.message || m.auth_register_error_failed();
				loading = false;
				turnstile?.reset();
				return;
			}

			goto(redirectTo ?? resolve("dashboard"));
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

			{#if data.turnstileSiteKey}
				<Turnstile bind:this={turnstile} siteKey={data.turnstileSiteKey} action="signup" />
			{/if}

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
		<div class="text-muted-foreground text-sm">
			{m.auth_register_has_account()}

			<a
				href={`${resolve("login")}${page.url.search}`}
				class="text-primary underline-offset-4 hover:underline">{m.auth_login_sign_in()}</a
			>
		</div>
	</Card.Footer>
</Card.Root>
