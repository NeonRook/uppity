<script lang="ts">
	import { onMount } from "svelte";

	const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

	let { siteKey, action }: { siteKey: string; action: string } = $props();

	let container: HTMLDivElement;
	let widget: string | undefined;

	/** The token issued so far, if any. */
	export function token() {
		return widget ? window.turnstile?.getResponse(widget) : undefined;
	}

	/** Replaces an issued token, which Cloudflare accepts once. A running challenge keeps going. */
	export function reset() {
		if (widget && token()) window.turnstile?.reset(widget);
	}

	onMount(() => {
		let mounted = true;
		const show = () => {
			if (!mounted) return;
			widget = window.turnstile?.render(container, {
				sitekey: siteKey,
				action,
				appearance: "interaction-only",
				size: "flexible",
			});
		};

		if (window.turnstile) {
			show();
		} else {
			let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
			if (!script) {
				script = document.createElement("script");
				script.src = SCRIPT_URL;
				script.async = true;
				document.head.append(script);
			}
			script.addEventListener("load", show, { once: true });
		}

		return () => {
			mounted = false;
			if (widget) window.turnstile?.remove(widget);
		};
	});
</script>

<!-- The widget adds a hidden input to the enclosing form, named by TURNSTILE_RESPONSE_FIELD. -->
<div bind:this={container}></div>
