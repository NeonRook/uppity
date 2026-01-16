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
	import { AlertCircle, ArrowLeft, Loader2 } from '@lucide/svelte';

	interface Props {
		form: {
			error?: string;
			name?: string;
			description?: string;
			type?: string;
			url?: string;
			method?: string;
		} | null;
	}

	let { form }: Props = $props();

	let loading = $state(false);
	let type = $state(untrack(() => form?.type || 'http'));
	let method = $state(untrack(() => form?.method || 'GET'));
	let sslCheckEnabled = $state(true);

	const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
	const intervals = [
		{ value: '30', label: '30 seconds' },
		{ value: '60', label: '1 minute' },
		{ value: '120', label: '2 minutes' },
		{ value: '300', label: '5 minutes' },
		{ value: '600', label: '10 minutes' },
		{ value: '900', label: '15 minutes' },
		{ value: '1800', label: '30 minutes' },
		{ value: '3600', label: '1 hour' }
	];
</script>

<svelte:head>
	<title>New Monitor - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/monitors">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">New Monitor</h1>
			<p class="text-muted-foreground">Create a new uptime monitor</p>
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
		{#if form?.error}
			<Alert variant="destructive" class="mb-6">
				<AlertCircle class="h-4 w-4" />
				<AlertDescription>{form.error}</AlertDescription>
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
						value={form?.name || ''}
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
						value={form?.description || ''}
						disabled={loading}
					/>
				</div>

				<div class="space-y-2">
					<Label for="type">Monitor Type</Label>
					<Select.Root type="single" name="type" value={type} onValueChange={(v) => (type = v)}>
						<Select.Trigger class="w-full">
							{type === 'http' ? 'HTTP(S)' : type === 'tcp' ? 'TCP Port' : 'Push / Heartbeat'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="http">HTTP(S) - Monitor a URL</Select.Item>
							<Select.Item value="tcp">TCP Port - Check if port is open</Select.Item>
							<Select.Item value="push">Push / Heartbeat - Wait for pings</Select.Item>
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="type" value={type} />
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
							value={form?.url || ''}
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
								{#each httpMethods as m (m)}
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
				<Card.Content>
					<p class="text-sm text-muted-foreground">
						A unique URL will be generated after creation. Your application should send regular
						requests to this URL. If no request is received within the expected interval, the
						monitor will be marked as down.
					</p>
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
						<Select.Root type="single" name="intervalSeconds" value="60">
							<Select.Trigger class="w-full">1 minute</Select.Trigger>
							<Select.Content>
								{#each intervals as interval (interval.value)}
									<Select.Item value={interval.value}>{interval.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="intervalSeconds" value="60" />
					</div>

					<div class="space-y-2">
						<Label for="timeoutSeconds">Timeout</Label>
						<Input
							id="timeoutSeconds"
							name="timeoutSeconds"
							type="number"
							value="30"
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
							value="0"
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
							value="1"
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
			<Button variant="outline" href="/monitors" disabled={loading}>Cancel</Button>
			<Button type="submit" disabled={loading}>
				{#if loading}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					Creating...
				{:else}
					Create Monitor
				{/if}
			</Button>
		</div>
	</form>
</div>
