<script lang="ts">
	import { enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	import { signOut } from "#lib/auth-client.js";
	import EmailVerificationBanner from "#lib/components/email-verification-banner.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { data, form } = $props();

	const view = $derived(data.view);
	const back = $derived(`?redirectTo=${encodeURIComponent(page.url.pathname)}`);

	// Signed out, the same link sends the visitor through login as the right account.
	async function switchAccount() {
		await signOut();
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{m.invitation_title()} - Uppity</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-2xl font-bold">{m.invitation_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if form?.error}
			<Alert variant="destructive">
				<AlertDescription>{form.error}</AlertDescription>
			</Alert>
		{/if}

		{#if view.state === "signed_out"}
			<p>{m.invitation_signed_out()}</p>
			<div class="flex gap-2">
				<Button href={`${resolve("login")}${back}`}>{m.invitation_sign_in()}</Button>
				<Button variant="outline" href={`${resolve("register")}${back}`}>
					{m.invitation_create_account()}
				</Button>
			</div>
		{:else if view.state === "pending"}
			<p>{m.invitation_prompt({ organization: view.invitation.organizationName })}</p>
			{#if view.invitation.invitedBy}
				<p class="text-muted-foreground text-sm">
					{m.invitation_invited_by({ email: view.invitation.invitedBy })}
				</p>
			{/if}
			<form method="POST" class="flex gap-2" use:enhance>
				<Button type="submit" formaction="?/accept">{m.invitation_accept()}</Button>
				<Button type="submit" variant="outline" formaction="?/decline">
					{m.invitation_decline()}
				</Button>
			</form>
		{:else if view.state === "unverified"}
			<p>{m.invitation_verify_first()}</p>
			<EmailVerificationBanner email={data.email} />
		{:else if view.state === "other_account"}
			<p>{m.invitation_other_account({ email: data.email })}</p>
			<Button onclick={switchAccount}>{m.verify_email_switch_account()}</Button>
		{:else}
			<p>{m.invitation_invalid()}</p>
			<a href={resolve("dashboard")} class="text-primary underline-offset-4 hover:underline">
				{m.verify_email_continue()}
			</a>
		{/if}
	</Card.Content>
</Card.Root>
