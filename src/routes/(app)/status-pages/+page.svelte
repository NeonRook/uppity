<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, Globe, ExternalLink, Pencil, Trash2, Lock, Unlock } from '@lucide/svelte';
	import type { StatusPage } from '$lib/server/db/schema';
	import EmptyState from '$lib/components/empty-state.svelte';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';

	let { data } = $props();

	let deletePageId = $state<string | null>(null);

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
		<EmptyState
			icon={Globe}
			title="No status pages"
			description="Create a public status page to keep your users informed."
			buttonText="Create Status Page"
			buttonHref="/status-pages/new"
		/>
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

<DeleteDialog
	itemId={deletePageId}
	onOpenChange={() => (deletePageId = null)}
	title="Delete status page?"
	description="This will permanently delete this status page. The public URL will no longer be accessible."
	inputName="statusPageId"
/>
