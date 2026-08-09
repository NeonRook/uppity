<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import * as Card from "$lib/components/ui/card";
	import { formatDateTimeShort } from "$lib/format";
	import { m } from "$lib/paraglide/messages.js";
	// Type-only, so it is erased at build time and pulls no server code into the
	// client bundle.
	import type { AuditLog } from "$lib/server/db/schema";

	interface Props {
		entries: AuditLog[];
		title: string;
	}

	let { entries, title }: Props = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if entries.length === 0}
			<p class="text-muted-foreground text-sm">{m.admin_audit_history_empty()}</p>
		{:else}
			<ul class="space-y-2">
				{#each entries as entry (entry.id)}
					<li class="flex items-center gap-3 text-sm">
						<span class="text-muted-foreground w-36 shrink-0 text-xs">
							{formatDateTimeShort(entry.createdAt)}
						</span>
						<Badge variant="secondary">{entry.action}</Badge>
						<span class="text-muted-foreground truncate">{entry.actorEmail}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
