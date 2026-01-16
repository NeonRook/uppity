<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon, Monitor } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { onMount } from 'svelte';

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
			// System preference
			if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		}
	}

	const isDark = $derived(
		mounted &&
			(theme === 'dark' ||
				(theme === 'system' &&
					typeof window !== 'undefined' &&
					window.matchMedia('(prefers-color-scheme: dark)').matches))
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button variant="ghost" size="icon" {...props}>
				{#if isDark}
					<Moon class="h-5 w-5" />
				{:else}
					<Sun class="h-5 w-5" />
				{/if}
				<span class="sr-only">Toggle theme</span>
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onclick={() => setTheme('light')}>
			<Sun class="mr-2 h-4 w-4" />
			Light
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => setTheme('dark')}>
			<Moon class="mr-2 h-4 w-4" />
			Dark
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => setTheme('system')}>
			<Monitor class="mr-2 h-4 w-4" />
			System
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
