<script lang="ts">
	import { resolve } from "$app/paths";

	import logoSvg from "#lib/assets/logo.svg";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Separator } from "#lib/components/ui/separator/index.js";
	import { CONTACT_EMAIL, GITHUB_URL, STATUS_URL } from "#lib/constants/links.js";
	import { m } from "#lib/paraglide/messages.js";

	let { children } = $props();

	const footerColumns = [
		{
			title: m.landing_footer_product(),
			links: [
				{ href: STATUS_URL, label: m.landing_footer_status() },
				{ href: resolve("pricing"), label: m.landing_footer_pricing() },
			],
		},
		{
			title: m.landing_footer_selfhost(),
			links: [
				{ href: GITHUB_URL, label: m.landing_footer_github() },
				{ href: `${GITHUB_URL}#docker-compose`, label: m.landing_footer_docker() },
				{ href: `${GITHUB_URL}/blob/main/LICENSE`, label: m.landing_footer_license() },
			],
		},
		{
			title: m.landing_footer_company(),
			links: [
				{ href: `${GITHUB_URL}/blob/main/SECURITY.md`, label: m.landing_footer_security() },
				{ href: `mailto:${CONTACT_EMAIL}`, label: m.landing_footer_contact() },
			],
		},
	];
</script>

<div class="bg-background min-h-screen">
	<header class="bg-card sticky top-0 z-50 border-b">
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
			<a
				href={resolve("/(marketing)")}
				class="text-foreground flex shrink-0 items-center gap-2 text-lg font-semibold"
			>
				<img src={logoSvg} alt="" class="size-7" />
				<!-- Below sm the wordmark is not painted — German runs ~30% longer and
				     used to render underneath the buttons at 390px — but it stays in the
				     accessibility tree, so the link is never an unnamed one. -->
				<span class="sr-only sm:not-sr-only">Uppity</span>
			</a>

			<nav class="flex items-center gap-1 sm:gap-3" aria-label={m.landing_footer_product()}>
				<!-- Hidden below sm for the same reason as the wordmark; the footer links it. -->
				<Button variant="ghost" class="hidden sm:inline-flex" href={resolve("pricing")}>
					{m.landing_footer_pricing()}
				</Button>
				<Button variant="ghost" href={resolve("login")}>{m.landing_cta_sign_in()}</Button>
				<Button href={resolve("register")}>{m.landing_cta_start_hosted()}</Button>
			</nav>
		</div>
	</header>

	{@render children()}

	<footer class="bg-card border-t">
		<div class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6">
			<div class="grid gap-8 sm:grid-cols-3">
				{#each footerColumns as column (column.title)}
					<div class="flex flex-col gap-3">
						<h2 class="text-foreground text-sm font-medium">{column.title}</h2>
						{#each column.links as link (link.href)}
							<a class="text-muted-foreground hover:text-foreground text-sm" href={link.href}>
								{link.label}
							</a>
						{/each}
					</div>
				{/each}
			</div>
			<Separator />
			<p class="text-muted-foreground text-xs">{m.landing_footer_tagline()}</p>
		</div>
	</footer>
</div>
