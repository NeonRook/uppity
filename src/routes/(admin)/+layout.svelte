<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { signOut } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		LayoutDashboard,
		Users,
		Building2,
		LogOut,
		ChevronDown,
		Menu,
		X,
		ShieldCheck
	} from '@lucide/svelte';

	let { data, children } = $props();

	let sidebarOpen = $state(false);
	let accountMenuOpen = $state(false);

	const navigation = [
		{ name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
		{ name: 'Users', href: '/admin/users', icon: Users },
		{ name: 'Organizations', href: '/admin/organizations', icon: Building2 }
	];

	function isActive(href: string): boolean {
		if (href === '/admin') {
			return page.url.pathname === '/admin';
		}
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	async function handleSignOut() {
		await signOut();
		goto(resolve('/admin/login'));
	}
</script>

{#if data.user}
	<div class="h-screen overflow-hidden">
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
			class="fixed inset-y-0 left-0 z-50 w-64 transform border-r bg-card transition-transform duration-200 ease-in-out lg:translate-x-0 {sidebarOpen
				? 'translate-x-0'
				: '-translate-x-full'}"
		>
			<div class="flex h-full flex-col">
				<div class="flex items-center gap-3 border-b p-4">
					<div
						class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
					>
						<ShieldCheck class="h-5 w-5" />
					</div>
					<div>
						<h1 class="text-lg font-semibold">Admin Panel</h1>
						<p class="text-xs text-muted-foreground">Uppity Administration</p>
					</div>
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
					<DropdownMenu.Root bind:open={accountMenuOpen}>
						<DropdownMenu.Trigger
							class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted"
						>
							<div
								class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
							>
								{data.user.name.charAt(0).toUpperCase()}
							</div>
							<div class="flex flex-1 flex-col items-start overflow-hidden">
								<span class="w-full truncate text-sm font-medium">{data.user.name}</span>
								<span class="w-full truncate text-xs text-muted-foreground">{data.user.email}</span>
							</div>
							<ChevronDown
								class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 {accountMenuOpen
									? 'rotate-180'
									: ''}"
							/>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-56" align="end">
							<DropdownMenu.Label>Admin Account</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item>
								<a href={resolve('/dashboard')} class="flex w-full items-center">
									<LayoutDashboard class="mr-2 h-4 w-4" />
									Back to App
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

		<div class="grid h-full grid-rows-[auto_1fr] lg:ml-64">
			<header class="flex h-14 items-center gap-4 border-b bg-card px-4 lg:hidden">
				<Button variant="ghost" size="icon" onclick={() => (sidebarOpen = !sidebarOpen)}>
					{#if sidebarOpen}
						<X class="h-6 w-6" />
					{:else}
						<Menu class="h-6 w-6" />
					{/if}
				</Button>
				<div class="flex items-center gap-2">
					<ShieldCheck class="h-5 w-5 text-primary" />
					<span class="text-sm font-medium">Admin Panel</span>
				</div>
			</header>

			<main class="overflow-y-auto bg-background p-6">
				{@render children()}
			</main>
		</div>
	</div>
{:else}
	<div class="flex min-h-screen items-center justify-center bg-background">
		<div class="w-full max-w-md p-6">
			{@render children()}
		</div>
	</div>
{/if}
