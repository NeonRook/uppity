<script lang="ts">
	import type { Snippet } from "svelte";

	import { m } from "#lib/paraglide/messages.js";

	interface Props {
		page: {
			name: string;
			description: string | null;
			logoUrl: string | null;
			faviconUrl: string | null;
		};
		title: string;
		children: Snippet;
	}

	let { page, title, children }: Props = $props();
</script>

<svelte:head>
	<title>{title}</title>
	{#if page.faviconUrl}
		<link rel="icon" href={page.faviconUrl} />
	{/if}
</svelte:head>

<div class="bg-background min-h-screen">
	<header class="bg-card border-b">
		<div class="mx-auto max-w-4xl px-4 py-6">
			<div class="flex items-center gap-4">
				{#if page.logoUrl}
					<img src={page.logoUrl} alt={page.name} class="h-10 w-auto" />
				{/if}
				<div>
					<h1 class="text-foreground text-2xl font-bold">{page.name}</h1>
					{#if page.description}
						<p class="text-muted-foreground text-sm">{page.description}</p>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-4 py-8">
		{@render children()}
	</main>

	<footer class="bg-card border-t py-6">
		<div class="text-muted-foreground mx-auto max-w-4xl px-4 text-center text-sm">
			{m.public_status_footer()}
		</div>
	</footer>
</div>
