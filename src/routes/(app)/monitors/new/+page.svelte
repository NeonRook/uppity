<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, ArrowLeft, LoaderCircle } from '@lucide/svelte';
	import { HTTP_METHODS, CHECK_INTERVALS, getIntervalLabel } from '$lib/constants/monitor';
	import { superForm } from 'sveltekit-superforms';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	const { form, errors, message, enhance, delayed } = superForm(untrack(() => data.form));

	function getMonitorTypeLabel(type: string): string {
		switch (type) {
			case 'http':
				return m.monitor_type_http();
			case 'tcp':
				return m.monitor_type_tcp();
			case 'push':
				return m.monitor_type_push();
			default:
				return type;
		}
	}
</script>

<svelte:head>
	<title>{m.monitor_new_title()} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/monitors">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.monitor_new_title()}</h1>
			<p class="text-muted-foreground">{m.monitor_new_subtitle()}</p>
		</div>
	</div>

	<form method="POST" use:enhance>
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
						aria-invalid={$errors.name ? 'true' : undefined}
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
						aria-invalid={$errors.description ? 'true' : undefined}
					/>
					<Field.Error errors={$errors.description} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="type">{m.monitor_type()}</Field.Label>
					<Select.Root
						type="single"
						name="type"
						value={$form.type}
						onValueChange={(v) => ($form.type = v as 'http' | 'tcp' | 'push')}
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
			</Card.Content>
		</Card.Root>

		{#if $form.type === 'http'}
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
							required={$form.type === 'http'}
							disabled={$delayed}
							aria-invalid={$errors.url ? 'true' : undefined}
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
								($form.method = v as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD')}
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
							checked={$form.sslCheckEnabled ?? true}
							onCheckedChange={(checked) => ($form.sslCheckEnabled = checked)}
						/>
						<input
							type="hidden"
							name="sslCheckEnabled"
							value={String($form.sslCheckEnabled ?? true)}
						/>
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{:else if $form.type === 'tcp'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>{m.monitor_tcp_config()}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<Field.Field>
							<Field.Label for="hostname">{m.monitor_hostname()} *</Field.Label>
							<Input
								id="hostname"
								name="hostname"
								placeholder={m.monitor_hostname_placeholder()}
								bind:value={$form.hostname}
								required={$form.type === 'tcp'}
								disabled={$delayed}
								aria-invalid={$errors.hostname ? 'true' : undefined}
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
								required={$form.type === 'tcp'}
								disabled={$delayed}
								aria-invalid={$errors.port ? 'true' : undefined}
							/>
							<Field.Error errors={$errors.port} />
						</Field.Field>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if $form.type === 'push'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>{m.monitor_push_config()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<p class="text-sm text-muted-foreground">
						{m.monitor_push_desc()}
					</p>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>{m.monitor_check_settings()}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
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
								{#each CHECK_INTERVALS as interval (interval.value)}
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
							aria-invalid={$errors.timeoutSeconds ? 'true' : undefined}
						/>
						<Field.Description>{m.monitor_timeout_seconds()}</Field.Description>
						<Field.Error errors={$errors.timeoutSeconds} />
					</Field.Field>
				</div>

				<div class="grid grid-cols-2 gap-4">
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
							aria-invalid={$errors.retries ? 'true' : undefined}
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
							aria-invalid={$errors.alertAfterFailures ? 'true' : undefined}
						/>
						<Field.Description>{m.monitor_alert_after_desc()}</Field.Description>
						<Field.Error errors={$errors.alertAfterFailures} />
					</Field.Field>
				</div>
			</Card.Content>
		</Card.Root>

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/monitors" disabled={$delayed}>{m.common_cancel()}</Button>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					{m.monitor_creating()}
				{:else}
					{m.monitor_create()}
				{/if}
			</Button>
		</div>
	</form>
</div>
