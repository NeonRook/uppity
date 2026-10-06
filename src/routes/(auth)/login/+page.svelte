<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";

	import LoginForm from "#lib/components/login-form.svelte";
	import * as Card from "#lib/components/ui/card/index.js";
	import { m } from "#lib/paraglide/messages.js";

	const afterSignIn = () => goto(resolve("dashboard"));
</script>

<svelte:head>
	<title>Login - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header class="space-y-1">
		<Card.Title class="text-2xl font-bold">{m.auth_login_title()}</Card.Title>
		<Card.Description>{m.auth_login_subtitle()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<LoginForm placeholder="name@example.com" {afterSignIn} />
	</Card.Content>
	<Card.Footer class="flex flex-col space-y-4">
		<div class="text-muted-foreground text-sm">
			<a
				href={resolve("forgot-password")}
				class="hover:text-primary underline-offset-4 hover:underline"
			>
				{m.auth_login_forgot_password()}
			</a>
		</div>
		<div class="text-muted-foreground text-sm">
			{m.auth_login_no_account()}

			<a href={resolve("register")} class="text-primary underline-offset-4 hover:underline"
				>{m.auth_login_sign_up()}</a
			>
		</div>
	</Card.Footer>
</Card.Root>
