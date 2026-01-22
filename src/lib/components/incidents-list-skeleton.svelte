<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<div class="space-y-4">
	{#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
		<Card.Root>
			<Card.Content class="p-6">
				<div class="flex items-start justify-between">
					<div class="flex-1 space-y-2">
						<div class="flex items-center gap-2">
							<Skeleton class="h-5 w-48" />
							<Skeleton class="h-5 w-20 rounded-full" />
							<Skeleton class="h-5 w-24 rounded-full" />
						</div>
						<div class="flex items-center gap-4">
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-4 w-28" />
							<Skeleton class="h-4 w-16" />
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Skeleton class="h-8 w-24" />
						<Skeleton class="h-8 w-8" />
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
