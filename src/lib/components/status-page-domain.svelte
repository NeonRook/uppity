<script lang="ts">
	import { enhance } from "$app/forms";
	import { CircleAlert, CircleCheck } from "@lucide/svelte";

	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/paraglide/messages.js";
	import { DOMAIN_CHALLENGE_LABEL } from "#lib/status-page.js";

	interface Props {
		claim: { domain: string; token: string } | null;
		active: boolean;
		lapsed: boolean;
		canManage: boolean;
		target: string;
		notice?: { ok: boolean; text: string };
	}

	let { claim, active, lapsed, canManage, target, notice }: Props = $props();

	const records = $derived(
		claim
			? [
					{ type: "CNAME", name: claim.domain, value: target },
					{ type: "TXT", name: `${DOMAIN_CHALLENGE_LABEL}.${claim.domain}`, value: claim.token },
				]
			: [],
	);
</script>

<Card.Root class="mt-6">
	<Card.Header>
		<Card.Title>{m.status_page_domain_title()}</Card.Title>
		<Card.Description>{m.status_page_domain_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if notice}
			<Alert variant={notice.ok ? "default" : "destructive"} role="status">
				{#if notice.ok}
					<CircleCheck class="h-4 w-4" />
				{:else}
					<CircleAlert class="h-4 w-4" />
				{/if}
				<AlertDescription>{notice.text}</AlertDescription>
			</Alert>
		{/if}

		{#if claim}
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-mono text-sm">{claim.domain}</span>
				{#if lapsed}
					<Badge variant="destructive">{m.status_page_domain_lapsed()}</Badge>
				{:else}
					<Badge variant={active ? "default" : "outline"}>
						{active ? m.status_page_domain_active() : m.status_page_domain_pending()}
					</Badge>
				{/if}
			</div>

			{#if lapsed}
				<Alert variant="destructive">
					<CircleAlert class="h-4 w-4" />
					<AlertDescription>{m.status_page_domain_lapsed_help()}</AlertDescription>
				</Alert>
			{/if}

			<p class="text-muted-foreground text-sm">{m.status_page_domain_records_help()}</p>
			<div class="overflow-x-auto rounded-lg border">
				<table class="w-full text-left text-sm">
					<thead class="text-muted-foreground">
						<tr>
							<th scope="col" class="p-3 font-medium">{m.status_page_domain_record_type()}</th>
							<th scope="col" class="p-3 font-medium">{m.status_page_domain_record_name()}</th>
							<th scope="col" class="p-3 font-medium">{m.status_page_domain_record_value()}</th>
						</tr>
					</thead>
					<tbody class="font-mono text-xs">
						{#each records as record (record.type)}
							<tr class="border-t">
								<td class="p-3">{record.type}</td>
								<td class="p-3 break-all">{record.name}</td>
								<td class="p-3 break-all">{record.value}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-muted-foreground text-sm">{m.status_page_domain_tls_help()}</p>

			{#if canManage}
				<div class="flex flex-wrap gap-2">
					<form method="POST" action="?/verifyDomain" use:enhance>
						<Button type="submit" variant="outline">{m.status_page_domain_check()}</Button>
					</form>
					<form method="POST" action="?/releaseDomain" use:enhance>
						<Button type="submit" variant="ghost">{m.status_page_domain_remove()}</Button>
					</form>
				</div>
			{/if}
		{:else if canManage}
			<form method="POST" action="?/claimDomain" use:enhance>
				<Field.Field>
					<Field.Label for="custom-domain">{m.status_page_domain_label()}</Field.Label>
					<div class="flex flex-col gap-2 sm:flex-row">
						<Input
							id="custom-domain"
							name="domain"
							placeholder="status.example.com"
							autocomplete="off"
							spellcheck={false}
							required
						/>
						<Button type="submit">{m.status_page_domain_add()}</Button>
					</div>
				</Field.Field>
			</form>
		{:else}
			<p class="text-muted-foreground text-sm">{m.status_page_domain_managers_only()}</p>
		{/if}
	</Card.Content>
</Card.Root>
