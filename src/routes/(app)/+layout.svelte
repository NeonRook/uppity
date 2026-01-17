<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { signOut } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import {
		LayoutDashboard,
		Monitor,
		TriangleAlert,
		Globe,
		Bell,
		Settings,
		LogOut,
		ChevronDown,
		Menu,
		X
	} from '@lucide/svelte';

	interface Props {
		data: {
			user: {
				name: string;
				email: string;
			};
		};
		children: Snippet;
	}

	let { data, children }: Props = $props();

	let sidebarOpen = $state(false);

	const navigation = [
		{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
		{ name: 'Monitors', href: '/monitors', icon: Monitor },
		{ name: 'Incidents', href: '/incidents', icon: TriangleAlert },
		{ name: 'Status Pages', href: '/status-pages', icon: Globe },
		{ name: 'Notifications', href: '/notifications', icon: Bell },
		{ name: 'Settings', href: '/settings', icon: Settings }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	async function handleSignOut() {
		await signOut();
		goto(resolve('/login'));
	}
</script>

<div class="flex min-h-screen">
	{#if sidebarOpen}
		<div
			class="fixed inset-0 z-40 bg-black/50 lg:hidden"
			onclick={() => (sidebarOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
			role="button"
			tabindex="-1"
		></div>
	{/if}

	<aside
		class="fixed inset-y-0 left-0 z-50 w-64 transform border-r bg-card transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 {sidebarOpen
			? 'translate-x-0'
			: '-translate-x-full'}"
	>
		<div class="flex h-full flex-col">
			<div class="flex h-16 items-center gap-2 border-b px-6">
				<Monitor class="h-6 w-6 text-primary" />
				<span class="text-xl font-bold">Uppity</span>
			</div>

			<nav class="flex-1 space-y-1 p-4">
				{#each navigation as item (item.href)}
					<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- navigation hrefs are dynamic -->
					<a
						href={resolve(item.href as any)}
						class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors {isActive(
							item.href
						)
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
						onclick={() => (sidebarOpen = false)}
					>
						<item.icon class="h-5 w-5" />
						{item.name}
					</a>
				{/each}
			</nav>

			<div class="border-t p-4">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted"
					>
						<div
							class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
						>
							{data.user.name.charAt(0).toUpperCase()}
						</div>
						<div class="flex flex-1 flex-col items-start">
							<span class="text-sm font-medium">{data.user.name}</span>
							<span class="text-xs text-muted-foreground">{data.user.email}</span>
						</div>
						<ChevronDown class="h-4 w-4 text-muted-foreground" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-56" align="end">
						<DropdownMenu.Label>My Account</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Item>
							<a href={resolve('/settings')} class="flex w-full items-center">
								<Settings class="mr-2 h-4 w-4" />
								Settings
							</a>
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onSelect={handleSignOut}>
							<LogOut class="mr-2 h-4 w-4" />
							Sign out
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
	</aside>

	<div class="flex flex-1 flex-col">
		<header class="flex h-16 items-center gap-4 border-b bg-card px-4 lg:hidden">
			<Button variant="ghost" size="icon" onclick={() => (sidebarOpen = !sidebarOpen)}>
				{#if sidebarOpen}
					<X class="h-6 w-6" />
				{:else}
					<Menu class="h-6 w-6" />
				{/if}
			</Button>
			<div class="flex flex-1 items-center gap-2">
				<Monitor class="h-6 w-6 text-primary" />
				<span class="text-xl font-bold">Uppity</span>
			</div>
			<ThemeToggle />
		</header>

		<header class="hidden h-16 items-center justify-end gap-4 border-b bg-card px-6 lg:flex">
			<ThemeToggle />
		</header>

		<main class="flex-1 overflow-y-auto bg-background p-6">
			{@render children()}
		</main>
	</div>
</div>
