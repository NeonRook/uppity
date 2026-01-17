<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Plus, Globe, ExternalLink, Pencil, Trash2, Lock, Unlock } from '@lucide/svelte';
	import type { StatusPage } from '$lib/server/db/schema';

	let { data } = $props();

	let deletePageId = $state<string | null>(null);
	let deleting = $state(false);

	function getStatusPageUrl(page: StatusPage): string {
		if (page.customDomain) {
			return `https://${page.customDomain}`;
		}
		return `/status/${page.slug}`;
	}
</script>

<svelte:head>
	<title>Status Pages - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Status Pages</h1>
			<p class="text-muted-foreground">Manage your public status pages</p>
		</div>
		<Button href="/status-pages/new">
			<Plus class="mr-2 h-4 w-4" />
			Create Status Page
		</Button>
	</div>

	{#if data.statusPages.length === 0}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<Globe class="h-12 w-12 text-muted-foreground/50" />
					<h3 class="mt-4 text-lg font-semibold">No status pages</h3>
					<p class="mt-2 mb-4 text-sm text-muted-foreground">
						Create a public status page to keep your users informed.
					</p>
					<Button href="/status-pages/new">
						<Plus class="mr-2 h-4 w-4" />
						Create Status Page
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4">
			{#each data.statusPages as page (page.id)}
				<Card.Root>
					<Card.Content class="flex items-center justify-between p-6">
						<div class="flex items-center gap-4">
							{#if page.logoUrl}
								<img src={page.logoUrl} alt={page.name} class="h-10 w-10 rounded-lg object-cover" />
							{:else}
								<div
									class="flex h-10 w-10 items-center justify-center rounded-lg"
									style="background-color: {page.primaryColor}20"
								>
									<Globe class="h-5 w-5" style="color: {page.primaryColor}" />
								</div>
							{/if}
							<div>
								<div class="flex items-center gap-2">
									<h3 class="font-semibold">{page.name}</h3>
									{#if page.isPublic}
										<Badge variant="secondary">
											<Unlock class="mr-1 h-3 w-3" />
											Public
										</Badge>
									{:else}
										<Badge variant="outline">
											<Lock class="mr-1 h-3 w-3" />
											Private
										</Badge>
									{/if}
								</div>
								<p class="text-sm text-muted-foreground">
									{page.customDomain || `/status/${page.slug}`}
								</p>
							</div>
						</div>

						<div class="flex items-center gap-2">
							<Button variant="ghost" size="icon" href={getStatusPageUrl(page)} target="_blank">
								<ExternalLink class="h-4 w-4" />
							</Button>

							<Button variant="ghost" size="icon" href="/status-pages/{page.id}">
								<Pencil class="h-4 w-4" />
							</Button>

							<Button variant="ghost" size="icon" onclick={() => (deletePageId = page.id)}>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<AlertDialog.Root
	open={deletePageId !== null}
	onOpenChange={(open) => !open && (deletePageId = null)}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete status page?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete this status page. The public URL will no longer be accessible.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (deletePageId = null)}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
						deletePageId = null;
					};
				}}
			>
				<input type="hidden" name="statusPageId" value={deletePageId} />
				<Button type="submit" variant="destructive" disabled={deleting}>
					{deleting ? 'Deleting...' : 'Delete'}
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
