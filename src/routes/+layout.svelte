<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}

<div style="display:none">
	{#each locales as locale (locale)}
		<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- localizeHref returns dynamic paths -->
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as any)}>
			{locale}
		</a>
	{/each}
</div>
