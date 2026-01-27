<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';
	import faviconSvg from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<!-- Favicon: SVG for modern browsers, ICO fallback for legacy -->
	<link rel="icon" href={faviconSvg} type="image/svg+xml" />
	<link rel="icon" href="/favicon.ico" sizes="48x48" />

	<!-- Apple Touch Icon for iOS home screen -->
	<link rel="apple-touch-icon" href="/icons/uppity-192.webp" />

	<!-- Web App Manifest for PWA support -->
	<link rel="manifest" href="/manifest.webmanifest" />

	<!-- Theme color for browser chrome -->
	<meta name="theme-color" content="#10b981" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#10b981" media="(prefers-color-scheme: dark)" />
</svelte:head>

{@render children()}

<div style="display:none">
	{#each locales as locale (locale)}
		<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- localizeHref returns dynamic paths -->
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as any)}>
			{locale}
		</a>
	{/each}
</div>
