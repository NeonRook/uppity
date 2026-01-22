<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/paraglide/messages.js';
</script>

<Card.Root>
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head class="w-[40px]"></Table.Head>
				<Table.Head>{m.monitors_table_name()}</Table.Head>
				<Table.Head>{m.monitors_table_endpoint()}</Table.Head>
				<Table.Head>{m.monitors_table_status()}</Table.Head>
				<Table.Head class="text-right">{m.monitors_table_uptime()}</Table.Head>
				<Table.Head class="text-right">{m.monitors_table_avg_response()}</Table.Head>
				<Table.Head class="w-[50px]"></Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
				<Table.Row>
					<Table.Cell>
						<Skeleton class="h-2 w-2 rounded-full" />
					</Table.Cell>
					<Table.Cell>
						<div class="space-y-1">
							<Skeleton class="h-5 w-32" />
							<Skeleton class="h-3 w-48" />
						</div>
					</Table.Cell>
					<Table.Cell>
						<div class="flex items-center gap-1">
							<Skeleton class="h-3 w-8" />
							<Skeleton class="h-3 w-24" />
						</div>
					</Table.Cell>
					<Table.Cell>
						<Skeleton class="h-5 w-16 rounded-full" />
					</Table.Cell>
					<Table.Cell class="text-right">
						<Skeleton class="ml-auto h-4 w-14" />
					</Table.Cell>
					<Table.Cell class="text-right">
						<Skeleton class="ml-auto h-4 w-12" />
					</Table.Cell>
					<Table.Cell>
						<Skeleton class="h-6 w-6" />
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</Card.Root>
