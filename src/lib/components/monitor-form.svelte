<script lang="ts">
	import { CircleAlert, LoaderCircle } from "@lucide/svelte";
	import type { Snippet } from "svelte";
	import type { Infer, SuperForm } from "sveltekit-superforms";

	import MonitorChannelPicker from "#lib/components/monitor-channel-picker.svelte";
	import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as Select from "#lib/components/ui/select/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { HTTP_METHODS, CHECK_INTERVALS, getIntervalLabel } from "#lib/constants/monitor.js";
	import { m } from "#lib/paraglide/messages.js";
	import type { createMonitorSchema } from "#lib/schemas/monitor.js";

	interface Props {
		superform: SuperForm<Infer<typeof createMonitorSchema>>;
		/** Create lets the type be chosen; edit fixes it and exposes the push grace period. */
		mode: "create" | "edit";
		cancelHref: string;
		/** The organization's notification channels the monitor can alert. */
		channels: { id: string; name: string; type: string; enabled: boolean }[];
		intervals?: readonly (typeof CHECK_INTERVALS)[number][];
		submitDisabled?: boolean;
		notice?: Snippet;
	}

	let {
		superform,
		mode,
		cancelHref,
		channels,
		intervals = CHECK_INTERVALS,
		submitDisabled = false,
		notice,
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance, delayed } = superform;

	function getMonitorTypeLabel(type: string): string {
		switch (type) {
			case "http":
				return m.monitor_type_http();
			case "tcp":
				return m.monitor_type_tcp();
			case "push":
				return m.monitor_type_push();
			default:
				return type;
		}
	}
</script>

<form method="POST" use:enhance>
	{@render notice?.()}

	{#if $message}
		<Alert variant="destructive" class="mb-6">
			<CircleAlert class="h-4 w-4" />
			<AlertDescription>{$message}</AlertDescription>
		</Alert>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.monitor_basic_info()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Field.Field>
				<Field.Label for="name">{m.common_name()} *</Field.Label>
				<Input
					id="name"
					name="name"
					placeholder={m.monitor_name_placeholder()}
					bind:value={$form.name}
					required
					disabled={$delayed}
					aria-invalid={$errors.name ? "true" : undefined}
				/>
				<Field.Error errors={$errors.name} />
			</Field.Field>

			<Field.Field>
				<Field.Label for="description">{m.common_description()}</Field.Label>
				<Textarea
					id="description"
					name="description"
					placeholder={m.monitor_desc_placeholder()}
					bind:value={$form.description}
					disabled={$delayed}
					aria-invalid={$errors.description ? "true" : undefined}
				/>
				<Field.Error errors={$errors.description} />
			</Field.Field>

			{#if mode === "create"}
				<Field.Field>
					<Field.Label for="type">{m.monitor_type()}</Field.Label>
					<Select.Root
						type="single"
						name="type"
						value={$form.type}
						onValueChange={(v) => ($form.type = v as "http" | "tcp" | "push")}
					>
						<Select.Trigger class="w-full">
							{getMonitorTypeLabel($form.type)}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="http">{m.monitor_type_http_desc()}</Select.Item>
							<Select.Item value="tcp">{m.monitor_type_tcp_desc()}</Select.Item>
							<Select.Item value="push">{m.monitor_type_push_desc()}</Select.Item>
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="type" value={$form.type} />
					<Field.Error errors={$errors.type} />
				</Field.Field>
			{:else}
				<Field.Field>
					<Field.Label>{m.monitor_type()}</Field.Label>
					<Input value={getMonitorTypeLabel($form.type)} disabled />
					<input type="hidden" name="type" value={$form.type} />
					<Field.Description>{m.monitor_type_cannot_change()}</Field.Description>
				</Field.Field>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if $form.type === "http"}
		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>{m.monitor_http_config()}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<Field.Field>
					<Field.Label for="url">{m.monitor_url()} *</Field.Label>
					<Input
						id="url"
						name="url"
						type="url"
						placeholder={m.monitor_url_placeholder()}
						bind:value={$form.url}
						required
						disabled={$delayed}
						aria-invalid={$errors.url ? "true" : undefined}
					/>
					<Field.Error errors={$errors.url} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="method">{m.monitor_http_method()}</Field.Label>
					<Select.Root
						type="single"
						name="method"
						value={$form.method}
						onValueChange={(v) =>
							($form.method = v as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD")}
					>
						<Select.Trigger class="w-full">
							{$form.method}
						</Select.Trigger>
						<Select.Content>
							{#each HTTP_METHODS as method (method)}
								<Select.Item value={method}>{method}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="method" value={$form.method} />
					<Field.Error errors={$errors.method} />
				</Field.Field>

				<Field.Field orientation="horizontal">
					<Field.Label>{m.monitor_ssl_check()}</Field.Label>
					<Field.Description>{m.monitor_ssl_check_desc()}</Field.Description>
					<Switch
						checked={$form.sslCheckEnabled ?? false}
						onCheckedChange={(checked) => ($form.sslCheckEnabled = checked)}
					/>
					<input
						type="hidden"
						name="sslCheckEnabled"
						value={String($form.sslCheckEnabled ?? false)}
					/>
				</Field.Field>
			</Card.Content>
		</Card.Root>
	{:else if $form.type === "tcp"}
		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>{m.monitor_tcp_config()}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="hostname">{m.monitor_hostname()} *</Field.Label>
						<Input
							id="hostname"
							name="hostname"
							placeholder={m.monitor_hostname_placeholder()}
							bind:value={$form.hostname}
							required
							disabled={$delayed}
							aria-invalid={$errors.hostname ? "true" : undefined}
						/>
						<Field.Error errors={$errors.hostname} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="port">{m.monitor_port()} *</Field.Label>
						<Input
							id="port"
							name="port"
							type="number"
							placeholder="443"
							min="1"
							max="65535"
							bind:value={$form.port}
							required
							disabled={$delayed}
							aria-invalid={$errors.port ? "true" : undefined}
						/>
						<Field.Error errors={$errors.port} />
					</Field.Field>
				</div>
			</Card.Content>
		</Card.Root>
	{:else if $form.type === "push"}
		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>{m.monitor_push_config()}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<p class="text-muted-foreground text-sm">
					{mode === "create" ? m.monitor_push_desc() : m.monitor_push_edit_desc()}
				</p>
				{#if mode === "edit"}
					<Field.Field>
						<Field.Label for="pushGracePeriodSeconds"
							>{m.monitor_grace_period_seconds()}</Field.Label
						>
						<Input
							id="pushGracePeriodSeconds"
							name="pushGracePeriodSeconds"
							type="number"
							min="0"
							bind:value={$form.pushGracePeriodSeconds}
							disabled={$delayed}
							aria-invalid={$errors.pushGracePeriodSeconds ? "true" : undefined}
						/>
						<Field.Description>
							{m.monitor_grace_period_desc()}
						</Field.Description>
						<Field.Error errors={$errors.pushGracePeriodSeconds} />
					</Field.Field>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root class="mt-6">
		<Card.Header>
			<Card.Title>{m.monitor_check_settings()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field.Field>
					<Field.Label for="intervalSeconds">{m.monitor_interval()}</Field.Label>
					<Select.Root
						type="single"
						name="intervalSeconds"
						value={String($form.intervalSeconds ?? 60)}
						onValueChange={(v) => ($form.intervalSeconds = Number(v))}
					>
						<Select.Trigger class="w-full">
							{getIntervalLabel(String($form.intervalSeconds ?? 60))}
						</Select.Trigger>
						<Select.Content>
							{#each intervals as interval (interval.value)}
								<Select.Item value={interval.value}>{interval.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="intervalSeconds" value={$form.intervalSeconds ?? 60} />
					<Field.Error errors={$errors.intervalSeconds} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="timeoutSeconds">{m.monitor_timeout()}</Field.Label>
					<Input
						id="timeoutSeconds"
						name="timeoutSeconds"
						type="number"
						bind:value={$form.timeoutSeconds}
						min="1"
						max="120"
						disabled={$delayed}
						aria-invalid={$errors.timeoutSeconds ? "true" : undefined}
					/>
					<Field.Description>{m.monitor_timeout_seconds()}</Field.Description>
					<Field.Error errors={$errors.timeoutSeconds} />
				</Field.Field>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field.Field>
					<Field.Label for="retries">{m.monitor_retries()}</Field.Label>
					<Input
						id="retries"
						name="retries"
						type="number"
						bind:value={$form.retries}
						min="0"
						max="5"
						disabled={$delayed}
						aria-invalid={$errors.retries ? "true" : undefined}
					/>
					<Field.Description>{m.monitor_retries_desc()}</Field.Description>
					<Field.Error errors={$errors.retries} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="alertAfterFailures">{m.monitor_alert_after()}</Field.Label>
					<Input
						id="alertAfterFailures"
						name="alertAfterFailures"
						type="number"
						bind:value={$form.alertAfterFailures}
						min="1"
						max="10"
						disabled={$delayed}
						aria-invalid={$errors.alertAfterFailures ? "true" : undefined}
					/>
					<Field.Description>{m.monitor_alert_after_desc()}</Field.Description>
					<Field.Error errors={$errors.alertAfterFailures} />
				</Field.Field>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="mt-6">
		<Card.Header>
			<Card.Title>{m.monitor_notifications()}</Card.Title>
			<Card.Description>{m.monitor_notifications_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<MonitorChannelPicker
				{channels}
				bind:selected={$form.channels}
				showSslExpiry={$form.type === "http" && ($form.sslCheckEnabled ?? false)}
				disabled={$delayed}
			/>
		</Card.Content>
	</Card.Root>

	<div class="mt-6 flex justify-end gap-4">
		<Button variant="outline" href={cancelHref} disabled={$delayed}>{m.common_cancel()}</Button>
		<Button type="submit" disabled={$delayed || submitDisabled}>
			{#if $delayed}
				<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
				{mode === "create" ? m.monitor_creating() : m.monitor_saving()}
			{:else}
				{mode === "create" ? m.monitor_create() : m.monitor_save()}
			{/if}
		</Button>
	</div>
</form>
