<script lang="ts">
	import { MailCheck } from "@lucide/svelte";
	import { toast } from "svelte-sonner";

	import { sendVerificationEmail } from "#lib/auth-client.js";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/paraglide/messages.js";

	let { email }: { email: string } = $props();

	let sending = $state(false);

	async function resend() {
		sending = true;
		const { error } = await sendVerificationEmail({ email });
		sending = false;
		if (error) toast.error(m.verify_email_failed());
		else toast.success(m.verify_email_sent());
	}
</script>

<Alert.Root class="mb-4">
	<MailCheck class="h-4 w-4" />
	<Alert.Title>{m.verify_email_title()}</Alert.Title>
	<Alert.Description>
		<p>{m.verify_email_desc({ email })}</p>
		<Button variant="outline" size="sm" class="mt-2" disabled={sending} onclick={resend}>
			{m.verify_email_resend()}
		</Button>
	</Alert.Description>
</Alert.Root>
