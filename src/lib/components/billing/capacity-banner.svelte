<script lang="ts">
	import { resolve } from "$app/paths";
	import { Pause, TriangleAlert } from "@lucide/svelte";

	import * as Alert from "#lib/components/ui/alert/index.js";
	import { m } from "#lib/paraglide/messages.js";
	import { getLocale } from "#lib/paraglide/runtime.js";
	import type { UsageLimitsData } from "#lib/server/services/usage-limits.js";

	let { usage }: { usage: UsageLimitsData } = $props();

	const active = $derived(usage.monitors.current);
	const limit = $derived(usage.monitors.limit);
	const excess = $derived(limit === -1 ? 0 : active - limit);
	const pauseAt = $derived(usage.capacity.pauseAt);
	const paused = $derived(usage.capacity.paused);
</script>

{#if excess > 0}
	<Alert.Root variant="destructive" class="mb-4">
		<TriangleAlert class="h-4 w-4" />
		<Alert.Title>{m.capacity_over_title()}</Alert.Title>
		<Alert.Description>
			<p>
				{pauseAt
					? m.capacity_over({
							active,
							limit,
							excess,
							date: new Date(pauseAt).toLocaleDateString(getLocale(), { dateStyle: "long" }),
						})
					: m.capacity_over_pending({ active, limit, excess })}
			</p>
			<p>
				{m.capacity_over_remedy()}
				<a href={resolve("/(app)/settings/billing")} class="underline underline-offset-2">
					{m.monitors_limit_add_capacity()}
				</a>
			</p>
		</Alert.Description>
	</Alert.Root>
{:else if paused > 0}
	<Alert.Root class="mb-4">
		<Pause class="h-4 w-4" />
		<Alert.Title>{m.capacity_paused_title()}</Alert.Title>
		<Alert.Description>
			<p>
				{paused === 1 ? m.capacity_paused_one() : m.capacity_paused_many({ count: paused })}
				<a href={resolve("/(app)/settings/billing")} class="underline underline-offset-2">
					{m.monitors_limit_add_capacity()}
				</a>
			</p>
		</Alert.Description>
	</Alert.Root>
{/if}
