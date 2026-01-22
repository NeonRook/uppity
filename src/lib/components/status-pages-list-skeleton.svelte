<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<div class="grid gap-4">
	{#each Array.from({ length: 3 }, (_, i) => i) as i (i)}
		<Card.Root>
			<Card.Content class="flex items-center justify-between p-6">
				<div class="flex items-center gap-4">
					<Skeleton class="h-10 w-10 rounded-lg" />
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<Skeleton class="h-5 w-36" />
							<Skeleton class="h-5 w-16 rounded-full" />
						</div>
						<Skeleton class="h-4 w-32" />
					</div>
				</div>
				<div class="flex items-center gap-2">
					<Skeleton class="h-8 w-8" />
					<Skeleton class="h-8 w-8" />
					<Skeleton class="h-8 w-8" />
				</div>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
