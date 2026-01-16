<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-background">
	<div class="w-full max-w-md p-6">
		{@render children()}
	</div>
</div>
