<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Monitor, TriangleAlert, Bell, Globe } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import logoSvg from '$lib/assets/logo.svg';

	const features = [
		{
			icon: Monitor,
			title: () => m.landing_feature_monitoring_title(),
			description: () => m.landing_feature_monitoring_desc()
		},
		{
			icon: TriangleAlert,
			title: () => m.landing_feature_incidents_title(),
			description: () => m.landing_feature_incidents_desc()
		},
		{
			icon: Bell,
			title: () => m.landing_feature_alerts_title(),
			description: () => m.landing_feature_alerts_desc()
		},
		{
			icon: Globe,
			title: () => m.landing_feature_status_title(),
			description: () => m.landing_feature_status_desc()
		}
	];
</script>

<svelte:head>
	<title>Uppity - Simple Uptime Monitoring</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="sticky top-0 z-50 border-b bg-white">
		<div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
			<a href={resolve('/')} class="flex items-center gap-2 text-xl font-bold text-gray-900">
				<img src={logoSvg} alt="Uppity logo" class="h-8 w-8" />
				Uppity
			</a>
			<div class="flex items-center gap-3">
				<Button variant="outline" class="border-gray-300 text-gray-700" href={resolve('/login')}>
					{m.landing_cta_sign_in()}
				</Button>
				<Button href={resolve('/register')}>
					{m.landing_cta_get_started()}
				</Button>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-4 py-16">
		<!-- Hero Section -->
		<section class="py-16 text-center">
			<h1 class="mb-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
				{m.landing_hero_title()}
			</h1>
			<p class="mx-auto mb-8 max-w-2xl text-lg text-gray-600">
				{m.landing_hero_subtitle()}
			</p>
			<div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
				<Button size="lg" href={resolve('/register')}>
					{m.landing_cta_get_started()}
				</Button>
				<Button variant="outline" size="lg" class="border-gray-300 text-gray-700" href={resolve('/login')}>
					{m.landing_cta_sign_in()}
				</Button>
			</div>
		</section>

		<!-- Features Section -->
		<section class="py-16">
			<div class="grid gap-6 sm:grid-cols-2">
				{#each features as feature, i (i)}
					<div class="rounded-lg border bg-white p-6 shadow-sm">
						<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
							<feature.icon class="h-5 w-5 text-gray-700" />
						</div>
						<h3 class="mb-2 text-lg font-semibold text-gray-900">
							{feature.title()}
						</h3>
						<p class="text-gray-600">
							{feature.description()}
						</p>
					</div>
				{/each}
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="border-t bg-white py-8">
		<div class="mx-auto max-w-4xl px-4 text-center">
			<p class="text-sm text-gray-500">
				{m.landing_footer_open_source()}
			</p>
		</div>
	</footer>
</div>
