<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, Globe, ExternalLink, Pencil, Trash2, Lock, Unlock } from '@lucide/svelte';
	import type { StatusPage } from '$lib/server/db/schema';
	import EmptyState from '$lib/components/empty-state.svelte';
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { deleteStatusPage } from '$lib/remote/status-pages.remote';

	let { data } = $props();

	let deletePageId = $state<string | null>(null);

	function getStatusPageUrl(page: StatusPage): string {
		if (page.customDomain) {
			return `https://${page.customDomain}`;
		}
		return `/status/${page.slug}`;
	}

	async function handleDelete(statusPageId: string) {
		await deleteStatusPage({ statusPageId });
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{m.status_pages_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.status_pages_title()}</h1>
			<p class="text-muted-foreground">{m.status_pages_subtitle()}</p>
		</div>
		<Button href="/status-pages/new">
			<Plus class="mr-2 h-4 w-4" />
			{m.status_pages_create()}
		</Button>
	</div>

	{#if data.statusPages.length === 0}
		<EmptyState
			icon={Globe}
			title={m.status_pages_empty_title()}
			description={m.status_pages_empty_desc()}
			buttonText={m.status_pages_create()}
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
											{m.status_pages_public()}
										</Badge>
									{:else}
										<Badge variant="outline">
											<Lock class="mr-1 h-3 w-3" />
											{m.status_pages_private()}
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
	onDelete={handleDelete}
	title={m.status_pages_delete_title()}
	description={m.status_pages_delete_desc()}
/>
