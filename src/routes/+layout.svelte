<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import faviconSvg from "$lib/assets/favicon.svg";
	import { locales, localizeHref } from "$lib/paraglide/runtime";
	/* Fontsource declares this file inside layout.css, so the browser cannot
	   find it until the stylesheet has downloaded and parsed — one full round
	   trip after the HTML on a cold connection, and every heading repaints when
	   it lands. Importing the URL here gets the same hashed, immutably-cached
	   asset into a preload beside the stylesheet request instead of behind it.
	   Latin only, and Sans only: the mono face carries measured values, none of
	   which are in a first viewport, and preloading it would put 14 KB in front
	   of the text that decides LCP. */
	import plexSansLatin from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url";

	import "./layout.css";

	let { children } = $props();
</script>

<svelte:head>
	<!-- Fonts are always fetched in CORS mode, so a preload without
	     `crossorigin` downloads the file a second time rather than priming it. -->
	<link rel="preload" as="font" type="font/woff2" href={plexSansLatin} crossorigin="anonymous" />

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
