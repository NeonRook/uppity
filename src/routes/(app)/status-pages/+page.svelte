<script lang="ts">
	import DeleteDialog from '$lib/components/delete-dialog.svelte';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusPagesListSkeleton from '$lib/components/status-pages-list-skeleton.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages.js';
	import { deleteStatusPage, getStatusPages } from '$lib/remote/status-pages.remote';
	import type { StatusPage } from '$lib/server/db/schema';
	import { ExternalLink, Globe, Lock, Pencil, Plus, Trash2, Unlock } from '@lucide/svelte';

	let { data } = $props();
	const statusPagesQuery = getStatusPages();

	// Prefer query data (after refresh/mutation), fallback to preloaded data
	const statusPages = $derived(statusPagesQuery.current ?? data.statusPages);

	// Usage limits from parent layout (self-hosted has no limits)
	const usageLimits = $derived(data.usageLimits);
	const canAddStatusPage = $derived(data.selfHosted || (usageLimits?.statusPages.canAdd ?? true));
	const statusPageUsageText = $derived(
		!data.selfHosted && usageLimits
			? `${usageLimits.statusPages.current}/${usageLimits.statusPages.limit === -1 ? '∞' : usageLimits.statusPages.limit}`
			: null
	);

	let deletePageId = $state<string | null>(null);

	function getStatusPageUrl(page: StatusPage): string {
		if (page.customDomain) {
			return `https://${page.customDomain}`;
		}
		return `/status/${page.slug}`;
	}

	async function handleDelete(statusPageId: string) {
		await deleteStatusPage({ statusPageId }).updates(
			getStatusPages().withOverride((pages) => pages.filter((p) => p.id !== statusPageId))
		);
	}
</script>

<svelte:head>
	<title>{m.status_pages_title()} - Uppity</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{m.status_pages_title()}</h1>
			<p class="text-muted-foreground">{m.status_pages_subtitle()}</p>
		</div>
		<div class="flex items-center gap-2">
			{#if statusPageUsageText}
				<Badge variant="outline" class="hidden text-xs font-normal sm:inline-flex">
					{statusPageUsageText} pages
				</Badge>
			{/if}
			{#if canAddStatusPage}
				<Button href="/status-pages/new">
					<Plus class="mr-2 h-4 w-4" />
					{m.status_pages_create()}
				</Button>
			{:else}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button disabled>
							<Plus class="mr-2 h-4 w-4" />
							{m.status_pages_create()}
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>Status page limit reached. Upgrade to add more.</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
	</div>

	{#if statusPagesQuery.loading && !statusPages}
		<StatusPagesListSkeleton />
	{:else if statusPagesQuery.error}
		<Card.Root>
			<Card.Content class="p-6">
				<p class="text-destructive">
					Failed to load status pages: {statusPagesQuery.error.message}
				</p>
			</Card.Content>
		</Card.Root>
	{:else if statusPages.length === 0}
		<EmptyState
			icon={Globe}
			title={m.status_pages_empty_title()}
			description={m.status_pages_empty_desc()}
			buttonText={m.status_pages_create()}
			buttonHref="/status-pages/new"
			buttonDisabled={!canAddStatusPage}
			buttonDisabledMessage="Status page limit reached. Upgrade to add more."
		/>
	{:else}
		<div class="grid gap-4">
			{#each statusPages as page (page.id)}
				<Card.Root>
					<Card.Content class="p-4 sm:p-6">
						<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<div class="flex items-center gap-4">
								{#if page.logoUrl}
									<img
										src={page.logoUrl}
										alt={page.name}
										class="h-10 w-10 shrink-0 rounded-lg object-cover"
									/>
								{:else}
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
										style="background-color: {page.primaryColor}20"
									>
										<Globe class="h-5 w-5" style="color: {page.primaryColor}" />
									</div>
								{/if}
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
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
									<p class="truncate text-sm text-muted-foreground">
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
