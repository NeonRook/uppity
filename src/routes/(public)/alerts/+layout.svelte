<script lang="ts">
	let { children } = $props();
</script>

<div class="bg-background flex min-h-screen items-center justify-center">
	<div class="bg-card text-foreground w-full max-w-md rounded-lg border p-6">
		{@render children()}
	</div>
</div>
