<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { ShieldCheck } from "@lucide/svelte";

	import { signOut, getSession } from "#lib/auth-client.js";
	import LoginForm from "#lib/components/login-form.svelte";
	import * as Card from "#lib/components/ui/card/index.js";
	import { m } from "#lib/paraglide/messages.js";

	async function afterSignIn() {
		const session = await getSession();
		if (session.data?.user?.role !== "admin") {
			await signOut();
			return m.admin_login_error_access();
		}

		await goto(resolve("admin"));
	}
</script>

<svelte:head>
	<title>{m.admin_login_title()} - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header class="space-y-4">
		<div class="flex justify-center">
			<div
				class="bg-primary text-primary-foreground flex h-12 w-12 items-center justify-center rounded-xl"
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
		<LoginForm placeholder="admin@example.com" {afterSignIn} />
	</Card.Content>
</Card.Root>
