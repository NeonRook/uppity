<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { signOut, organization } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
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
		X,
		Building2,
		Check,
		Sun,
		Moon,
		SunMoon,
		ShieldCheck
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data, children } = $props();

	let sidebarOpen = $state(false);
	let switchingOrg = $state(false);
	let orgMenuOpen = $state(false);
	let accountMenuOpen = $state(false);

	// Theme state
	type Theme = 'light' | 'dark' | 'system';
	let theme = $state<Theme>('system');
	let mounted = $state(false);

	onMount(() => {
		const stored = localStorage.getItem('theme') as Theme | null;
		if (stored) {
			theme = stored;
		}
		mounted = true;
	});

	function setTheme(newTheme: Theme) {
		theme = newTheme;
		localStorage.setItem('theme', newTheme);

		if (newTheme === 'dark') {
			document.documentElement.classList.add('dark');
		} else if (newTheme === 'light') {
			document.documentElement.classList.remove('dark');
		} else {
			if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		}
	}

	const navigation = [
		{ name: m.nav_dashboard(), href: '/dashboard', icon: LayoutDashboard },
		{ name: m.nav_monitors(), href: '/monitors', icon: Monitor },
		{ name: m.nav_incidents(), href: '/incidents', icon: TriangleAlert },
		{ name: m.nav_status_pages(), href: '/status-pages', icon: Globe },
		{ name: m.nav_notifications(), href: '/notifications', icon: Bell },
		{ name: m.nav_settings(), href: '/settings', icon: Settings }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	async function handleSignOut() {
		await signOut();
		goto(resolve('/login'));
	}

	async function switchOrganization(orgId: string) {
		if (orgId === data.currentOrganization?.id) return;
		switchingOrg = true;
		try {
			await organization.setActive({ organizationId: orgId });
			window.location.reload();
		} catch (error) {
			console.error('Failed to switch organization:', error);
		} finally {
			switchingOrg = false;
		}
	}
</script>

<Tooltip.Provider>
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
				<!-- Org Switcher -->
				<div class="border-b p-3">
					<DropdownMenu.Root bind:open={orgMenuOpen}>
						<DropdownMenu.Trigger
							class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted"
							disabled={switchingOrg}
						>
							<div
								class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
							>
								<Building2 class="h-4 w-4" />
							</div>
							<div class="flex flex-1 flex-col items-start overflow-hidden">
								<span class="w-full truncate text-sm font-medium">
									{data.currentOrganization?.name ?? m.org_no_organization()}
								</span>
							</div>
							<ChevronDown
								class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 {orgMenuOpen
									? 'rotate-180'
									: ''}"
							/>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-56" align="start">
							<DropdownMenu.Label>{m.org_organizations()}</DropdownMenu.Label>
							<DropdownMenu.Separator />
							{#each data.organizations as org (org.id)}
								<DropdownMenu.Item
									onSelect={() => switchOrganization(org.id)}
									class="flex items-center justify-between"
								>
									<span class="truncate">{org.name}</span>
									{#if org.id === data.currentOrganization?.id}
										<Check class="h-4 w-4 shrink-0" />
									{/if}
								</DropdownMenu.Item>
							{/each}
							{#if data.organizations.length === 0}
								<DropdownMenu.Item disabled>{m.org_no_organizations()}</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Item>
								<a href={resolve('/settings')} class="flex w-full items-center">
									<Settings class="mr-2 h-4 w-4" />
									{m.org_manage()}
								</a>
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
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
							<DropdownMenu.Label>{m.account_my_account()}</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item>
								<a href={resolve('/settings')} class="flex w-full items-center">
									<Settings class="mr-2 h-4 w-4" />
									{m.common_settings()}
								</a>
							</DropdownMenu.Item>
							{#if data.user.role === 'admin'}
								<DropdownMenu.Item>
									<a href={resolve('/admin')} class="flex w-full items-center">
										<ShieldCheck class="mr-2 h-4 w-4" />
										{m.account_admin_panel()}
									</a>
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Label class="text-xs font-normal text-muted-foreground">
								{m.theme_theme()}
							</DropdownMenu.Label>
							<DropdownMenu.Item onSelect={() => setTheme('light')}>
								<Sun class="mr-2 h-4 w-4" />
								{m.theme_light()}
								{#if mounted && theme === 'light'}
									<Check class="ml-auto h-4 w-4" />
								{/if}
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => setTheme('dark')}>
								<Moon class="mr-2 h-4 w-4" />
								{m.theme_dark()}
								{#if mounted && theme === 'dark'}
									<Check class="ml-auto h-4 w-4" />
								{/if}
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => setTheme('system')}>
								<SunMoon class="mr-2 h-4 w-4" />
								{m.theme_system()}
								{#if mounted && theme === 'system'}
									<Check class="ml-auto h-4 w-4" />
								{/if}
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={handleSignOut}>
								<LogOut class="mr-2 h-4 w-4" />
								{m.account_sign_out()}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</div>
		</aside>

		<div class="grid h-full grid-rows-[auto_1fr] lg:ml-64">
			<!-- Mobile header -->
			<header class="flex h-14 items-center gap-4 border-b bg-card px-4 lg:hidden">
				<Button variant="ghost" size="icon" onclick={() => (sidebarOpen = !sidebarOpen)}>
					{#if sidebarOpen}
						<X class="h-6 w-6" />
					{:else}
						<Menu class="h-6 w-6" />
					{/if}
				</Button>
				<span class="truncate text-sm font-medium">
					{data.currentOrganization?.name ?? 'Uppity'}
				</span>
			</header>

			<main class="overflow-y-auto bg-background p-4 sm:p-6">
				{@render children()}
			</main>
		</div>
	</div>
</Tooltip.Provider>
