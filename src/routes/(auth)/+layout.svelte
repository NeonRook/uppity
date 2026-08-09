<script lang="ts">
	let { children } = $props();
</script>

<div class="bg-background flex min-h-screen items-center justify-center">
	<div class="w-full max-w-md p-6">
		{@render children()}
	</div>
</div>
