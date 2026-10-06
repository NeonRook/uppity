<script lang="ts">
	import * as Breadcrumb from "#lib/components/ui/breadcrumb/index.js";
	import { m } from "#lib/paraglide/messages.js";

	interface Props {
		/** Breadcrumb label of the current page, shown under "Settings". */
		section: string;
		title: string;
		description: string;
	}

	let { section, title, description }: Props = $props();
</script>

<div>
	<Breadcrumb.Root class="mb-2">
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/settings">{m.nav_settings()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{section}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
	<h1 class="text-3xl font-bold tracking-tight">{title}</h1>
	<p class="text-muted-foreground">{description}</p>
</div>
