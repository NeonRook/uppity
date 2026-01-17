<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, ArrowLeft, LoaderCircle } from '@lucide/svelte';
	import { HTTP_METHODS, CHECK_INTERVALS, getIntervalLabel } from '$lib/constants/monitor';

	let { data } = $props();

	let loading = $state(false);
	let type = $state(untrack(() => data.monitor.type));
	let method = $state(untrack(() => data.monitor.method ?? 'GET'));
	let sslCheckEnabled = $state(untrack(() => data.monitor.sslCheckEnabled ?? true));
	let intervalSeconds = $state(untrack(() => String(data.monitor.intervalSeconds)));
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

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
	>
		{#if data.form.message}
			<Alert variant="destructive" class="mb-6">
				<CircleAlert class="h-4 w-4" />
				<AlertDescription>{data.form.message}</AlertDescription>
			</Alert>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>Basic Information</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Name *</Label>
					<Input
						id="name"
						name="name"
						placeholder="My Website"
						value={data.form.data.name}
						required
						disabled={loading}
					/>
				</div>

				<div class="space-y-2">
					<Label for="description">Description</Label>
					<Textarea
						id="description"
						name="description"
						placeholder="Optional description"
						value={data.form.data.description ?? ''}
						disabled={loading}
					/>
				</div>

				<div class="space-y-2">
					<Label>Monitor Type</Label>
					<Input
						value={type === 'http' ? 'HTTP(S)' : type === 'tcp' ? 'TCP Port' : 'Push / Heartbeat'}
						disabled
					/>
					<input type="hidden" name="type" value={type} />
					<p class="text-xs text-muted-foreground">Monitor type cannot be changed after creation</p>
				</div>
			</Card.Content>
		</Card.Root>

		{#if type === 'http'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>HTTP Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="url">URL *</Label>
						<Input
							id="url"
							name="url"
							type="url"
							placeholder="https://example.com"
							value={data.monitor.url ?? ''}
							required={type === 'http'}
							disabled={loading}
						/>
					</div>

					<div class="space-y-2">
						<Label for="method">HTTP Method</Label>
						<Select.Root
							type="single"
							name="method"
							value={method}
							onValueChange={(v) => (method = v)}
						>
							<Select.Trigger class="w-full">
								{method}
							</Select.Trigger>
							<Select.Content>
								{#each HTTP_METHODS as m (m)}
									<Select.Item value={m}>{m}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="method" value={method} />
					</div>

					<div class="flex items-center justify-between">
						<div class="space-y-0.5">
							<Label>SSL Certificate Check</Label>
							<p class="text-sm text-muted-foreground">Monitor SSL certificate expiry</p>
						</div>
						<Switch bind:checked={sslCheckEnabled} />
						<input type="hidden" name="sslCheckEnabled" value={sslCheckEnabled.toString()} />
					</div>
				</Card.Content>
			</Card.Root>
		{:else if type === 'tcp'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>TCP Configuration</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="hostname">Hostname *</Label>
							<Input
								id="hostname"
								name="hostname"
								placeholder="example.com"
								value={data.monitor.hostname ?? ''}
								required={type === 'tcp'}
								disabled={loading}
							/>
						</div>
						<div class="space-y-2">
							<Label for="port">Port *</Label>
							<Input
								id="port"
								name="port"
								type="number"
								placeholder="443"
								min="1"
								max="65535"
								value={data.monitor.port ?? ''}
								required={type === 'tcp'}
								disabled={loading}
							/>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		{:else if type === 'push'}
			<Card.Root class="mt-6">
				<Card.Header>
					<Card.Title>Push / Heartbeat</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<p class="text-sm text-muted-foreground">
						Your application should send regular requests to the push URL. If no request is received
						within the expected interval plus grace period, the monitor will be marked as down.
					</p>
					<div class="space-y-2">
						<Label for="pushGracePeriodSeconds">Grace Period (seconds)</Label>
						<Input
							id="pushGracePeriodSeconds"
							name="pushGracePeriodSeconds"
							type="number"
							min="0"
							value={data.monitor.pushGracePeriodSeconds ?? 60}
							disabled={loading}
						/>
						<p class="text-xs text-muted-foreground">
							Extra time to wait after the interval before marking as down
						</p>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title>Check Settings</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="intervalSeconds">Check Interval</Label>
						<Select.Root
							type="single"
							name="intervalSeconds"
							value={intervalSeconds}
							onValueChange={(v) => (intervalSeconds = v)}
						>
							<Select.Trigger class="w-full">{getIntervalLabel(intervalSeconds)}</Select.Trigger>
							<Select.Content>
								{#each CHECK_INTERVALS as interval (interval.value)}
									<Select.Item value={interval.value}>{interval.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="intervalSeconds" value={intervalSeconds} />
					</div>

					<div class="space-y-2">
						<Label for="timeoutSeconds">Timeout</Label>
						<Input
							id="timeoutSeconds"
							name="timeoutSeconds"
							type="number"
							value={data.form.data.timeoutSeconds ?? 30}
							min="1"
							max="120"
							disabled={loading}
						/>
						<p class="text-xs text-muted-foreground">seconds</p>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="retries">Retries</Label>
						<Input
							id="retries"
							name="retries"
							type="number"
							value={data.form.data.retries ?? 0}
							min="0"
							max="5"
							disabled={loading}
						/>
						<p class="text-xs text-muted-foreground">Retry before marking as down</p>
					</div>

					<div class="space-y-2">
						<Label for="alertAfterFailures">Alert After Failures</Label>
						<Input
							id="alertAfterFailures"
							name="alertAfterFailures"
							type="number"
							value={data.form.data.alertAfterFailures ?? 1}
							min="1"
							max="10"
							disabled={loading}
						/>
						<p class="text-xs text-muted-foreground">Consecutive failures before alert</p>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<div class="mt-6 flex justify-end gap-4">
			<Button variant="outline" href="/monitors/{data.monitor.id}" disabled={loading}>
				Cancel
			</Button>
			<Button type="submit" disabled={loading}>
				{#if loading}
					<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
					Saving...
				{:else}
					Save Changes
				{/if}
			</Button>
		</div>
	</form>
</div>
