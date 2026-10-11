<script lang="ts">
	import { enhance } from "$app/forms";
	import { Check, Copy, KeyRound, LoaderCircle } from "@lucide/svelte";
	import { untrack } from "svelte";
	import { superForm } from "sveltekit-superforms";

	import SettingsHeader from "#lib/components/settings-header.svelte";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
	import { Alert, AlertDescription, AlertTitle } from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { formatRelativeTime } from "#lib/format.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getLocale } from "#lib/paraglide/runtime.js";

	let { data } = $props();

	const {
		form,
		errors,
		message,
		enhance: formEnhance,
		delayed,
	} = superForm(untrack(() => data.form));

	let copied = $state(false);
	let revoking = $state<{ id: string; name: string | null } | null>(null);
	let revokeBusy = $state(false);

	const atCap = $derived(data.keys.length >= data.maxKeys);

	async function copyKey(key: string) {
		await navigator.clipboard.writeText(key);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="space-y-6">
	<SettingsHeader
		section={m.settings_api_keys()}
		title={m.settings_api_keys()}
		description={m.settings_api_keys_desc()}
	/>

	{#if data.access === "none"}
		<Alert>
			<AlertDescription>{m.api_keys_no_access()}</AlertDescription>
		</Alert>
	{:else}
		<Card.Root>
			<Card.Content class="text-muted-foreground space-y-2 text-sm">
				<p>{m.api_keys_read_only()}</p>
				<p>{m.api_keys_rate_limit({ count: data.requestsPerMinute })}</p>
				<p>
					<a class="text-foreground underline underline-offset-4" href="/api/openapi.json">
						{m.api_keys_reference()}
					</a>
				</p>
			</Card.Content>
		</Card.Root>

		{#if $message?.createdKey}
			<Alert>
				<KeyRound class="h-4 w-4" />
				<AlertTitle>{m.api_keys_created_title()}</AlertTitle>
				<AlertDescription class="space-y-3">
					<p>{m.api_keys_created_desc()}</p>
					<div class="flex items-center gap-2">
						<code class="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 font-mono text-sm">
							{$message.createdKey}
						</code>
						<Button variant="outline" size="sm" onclick={() => copyKey($message.createdKey)}>
							{#if copied}
								<Check class="mr-1 h-4 w-4" />
								{m.api_keys_copied()}
							{:else}
								<Copy class="mr-1 h-4 w-4" />
								{m.api_keys_copy()}
							{/if}
						</Button>
					</div>
				</AlertDescription>
			</Alert>
		{/if}

		{#if data.canManage}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.api_keys_create_title()}</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if atCap}
						<p class="text-muted-foreground text-sm">{m.api_keys_at_cap({ max: data.maxKeys })}</p>
					{:else}
						<form method="POST" action="?/create" use:formEnhance class="flex items-end gap-2">
							<Field.Field class="flex-1">
								<Field.Label for="name">{m.api_keys_name()}</Field.Label>
								<Input
									id="name"
									name="name"
									bind:value={$form.name}
									placeholder={m.api_keys_name_placeholder()}
									maxlength={32}
									disabled={$delayed}
								/>
								{#if $errors.name}<Field.Error>{$errors.name}</Field.Error>{/if}
							</Field.Field>
							<Button type="submit" disabled={$delayed}>
								{#if $delayed}<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />{/if}
								{m.api_keys_create()}
							</Button>
						</form>
						{#if $message?.error}
							<p class="text-destructive mt-2 text-sm">{$message.error}</p>
						{/if}
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<Card.Title>{m.api_keys_list_title()}</Card.Title>
				<Badge variant="secondary">
					{m.api_keys_count({ count: data.keys.length, max: data.maxKeys })}
				</Badge>
			</div>
			{#if !data.canManage}
				<Card.Description>{m.api_keys_managers_only()}</Card.Description>
			{/if}
		</Card.Header>
		<Card.Content>
			{#if data.keys.length === 0}
				<p class="text-muted-foreground text-sm">{m.api_keys_empty()}</p>
			{:else}
				<ul class="divide-y">
					{#each data.keys as key (key.id)}
						<li class="flex items-center justify-between gap-4 py-3">
							<div class="min-w-0">
								<p class="truncate font-medium">{key.name}</p>
								<p class="text-muted-foreground text-sm">
									<code class="font-mono">{key.start}…</code>
									·
									{key.lastRequest
										? m.api_keys_last_used({
												when: formatRelativeTime(key.lastRequest, getLocale()),
											})
										: m.api_keys_never_used()}
								</p>
							</div>
							{#if data.canManage}
								<Button
									variant="outline"
									size="sm"
									onclick={() => (revoking = { id: key.id, name: key.name })}
								>
									{m.api_keys_revoke()}
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<AlertDialog.Root open={revoking !== null} onOpenChange={(open) => !open && (revoking = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title
				>{m.api_keys_revoke_title({ name: revoking?.name ?? "" })}</AlertDialog.Title
			>
			<AlertDialog.Description>{m.api_keys_revoke_desc()}</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			method="POST"
			action="?/revoke"
			use:enhance={() => {
				revokeBusy = true;
				return async ({ update }) => {
					await update();
					revokeBusy = false;
					revoking = null;
				};
			}}
		>
			<input type="hidden" name="keyId" value={revoking?.id ?? ""} />
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button type="submit" variant="destructive" disabled={revokeBusy}>
					{#if revokeBusy}<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />{/if}
					{m.api_keys_revoke()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
