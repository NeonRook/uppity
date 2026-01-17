<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
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

	let { data } = $props();

	const { form, errors, message, enhance, delayed } = superForm(
		untrack(() => data.form),
		{
			resetForm: false
		}
	);
</script>

<svelte:head>
	<title>Edit {data.monitor.name} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/monitors/{data.monitor.id}">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Edit Monitor</h1>
			<p class="text-muted-foreground">{data.monitor.name}</p>
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
				<Card.Title>Basic Information</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<Field.Field>
					<Field.Label for="name">Name *</Field.Label>
					<Input
						id="name"
						name="name"
						placeholder="My Website"
						bind:value={$form.name}
						required
						disabled={$delayed}
						aria-invalid={$errors.name ? 'true' : undefined}
					/>
					<Field.Error errors={$errors.name} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="description">Description</Field.Label>
					<Textarea
						id="description"
						name="description"
						placeholder="Optional description"
						bind:value={$form.description}
						disabled={$delayed}
						aria-invalid={$errors.description ? 'true' : undefined}
					/>
					<Field.Error errors={$errors.description} />
				</Field.Field>

				<Field.Field>
					<Field.Label>Monitor Type</Field.Label>
					<Input
						value={$form.type === 'http'
							? 'HTTP(S)'
							: $form.type === 'tcp'
								? 'TCP Port'
								: 'Push / Heartbeat'}
						disabled
					/>
					<input type="hidden" name="type" value={$form.type} />
					<Field.Description>Monitor type cannot be changed after creation</Field.Description>
				</Field.Field>
			</Card.Content>
		</Card.Root>

		{#if $form.type === 'http'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>HTTP Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="url">URL *</Field.Label>
						<Input
							id="url"
							name="url"
							type="url"
							placeholder="https://example.com"
							bind:value={$form.url}
							required={$form.type === 'http'}
							disabled={$delayed}
							aria-invalid={$errors.url ? 'true' : undefined}
						/>
						<Field.Error errors={$errors.url} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="method">HTTP Method</Field.Label>
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
								{#each HTTP_METHODS as m (m)}
									<Select.Item value={m}>{m}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="method" value={$form.method} />
						<Field.Error errors={$errors.method} />
					</Field.Field>

					<Field.Field orientation="horizontal">
						<Field.Label>SSL Certificate Check</Field.Label>
						<Field.Description>Monitor SSL certificate expiry</Field.Description>
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
		{:else if $form.type === 'tcp'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>TCP Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<Field.Field>
							<Field.Label for="hostname">Hostname *</Field.Label>
							<Input
								id="hostname"
								name="hostname"
								placeholder="example.com"
								bind:value={$form.hostname}
								required={$form.type === 'tcp'}
								disabled={$delayed}
								aria-invalid={$errors.hostname ? 'true' : undefined}
							/>
							<Field.Error errors={$errors.hostname} />
						</Field.Field>
						<Field.Field>
							<Field.Label for="port">Port *</Field.Label>
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
					<Card.Title>Push / Heartbeat</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<p class="text-sm text-muted-foreground">
						Your application should send regular requests to the push URL. If no request is received
						within the expected interval plus grace period, the monitor will be marked as down.
					</p>
					<Field.Field>
						<Field.Label for="pushGracePeriodSeconds">Grace Period (seconds)</Field.Label>
						<Input
							id="pushGracePeriodSeconds"
							name="pushGracePeriodSeconds"
							type="number"
							min="0"
							bind:value={$form.pushGracePeriodSeconds}
							disabled={$delayed}
							aria-invalid={$errors.pushGracePeriodSeconds ? 'true' : undefined}
						/>
						<Field.Description>
							Extra time to wait after the interval before marking as down
						</Field.Description>
						<Field.Error errors={$errors.pushGracePeriodSeconds} />
					</Field.Field>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>Check Settings</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<Field.Field>
						<Field.Label for="intervalSeconds">Check Interval</Field.Label>
						<Select.Root
							type="single"
							name="intervalSeconds"
							value={String($form.intervalSeconds)}
							onValueChange={(v) => ($form.intervalSeconds = Number(v))}
						>
							<Select.Trigger class="w-full">
								{getIntervalLabel(String($form.intervalSeconds))}
							</Select.Trigger>
							<Select.Content>
								{#each CHECK_INTERVALS as interval (interval.value)}
									<Select.Item value={interval.value}>{interval.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="intervalSeconds" value={$form.intervalSeconds} />
						<Field.Error errors={$errors.intervalSeconds} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="timeoutSeconds">Timeout</Field.Label>
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
						<Field.Description>seconds</Field.Description>
						<Field.Error errors={$errors.timeoutSeconds} />
					</Field.Field>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<Field.Field>
						<Field.Label for="retries">Retries</Field.Label>
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
						<Field.Description>Retry before marking as down</Field.Description>
						<Field.Error errors={$errors.retries} />
					</Field.Field>

					<Field.Field>
						<Field.Label for="alertAfterFailures">Alert After Failures</Field.Label>
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
						<Field.Description>Consecutive failures before alert</Field.Description>
						<Field.Error errors={$errors.alertAfterFailures} />
					</Field.Field>
				</div>
			</Card.Content>
		</Card.Root>

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/monitors/{data.monitor.id}" disabled={$delayed}>
				Cancel
			</Button>
			<Button type="submit" disabled={$delayed}>
				{#if $delayed}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					Saving...
				{:else}
					Save Changes
				{/if}
			</Button>
		</div>
	</form>
</div>
