<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Field from '$lib/components/ui/field';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { CircleAlert, LoaderCircle, ArrowLeft } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const { form, errors, message, enhance, delayed } = superForm(untrack(() => data.form));

	function getRoleLabel(role: string | undefined): string {
		return role === 'admin' ? m.admin_role_admin() : m.admin_role_user();
	}
</script>

<svelte:head>
	<title>{m.admin_users_create()} - Admin - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/admin/users">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold">{m.admin_users_create()}</h1>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			<form method="POST" use:enhance class="space-y-4">
				{#if $message}
					<Alert variant="destructive">
						<CircleAlert class="h-4 w-4" />
						<AlertDescription>{$message}</AlertDescription>
					</Alert>
				{/if}

				<Field.Field>
					<Field.Label for="name">{m.common_name()}</Field.Label>
					<Input
						id="name"
						name="name"
						bind:value={$form.name}
						disabled={$delayed}
						placeholder="John Doe"
					/>
					<Field.Error errors={$errors.name} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="email">{m.common_email()}</Field.Label>
					<Input
						id="email"
						name="email"
						type="email"
						bind:value={$form.email}
						disabled={$delayed}
						placeholder="john@example.com"
					/>
					<Field.Error errors={$errors.email} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="password">{m.common_password()}</Field.Label>
					<Input
						id="password"
						name="password"
						type="password"
						bind:value={$form.password}
						disabled={$delayed}
						placeholder={m.admin_users_password_placeholder()}
					/>
					<Field.Error errors={$errors.password} />
				</Field.Field>

				<Field.Field>
					<Field.Label for="role">{m.common_role()}</Field.Label>
					<input type="hidden" name="role" bind:value={$form.role} />
					<Select.Root
						type="single"
						name="role"
						value={$form.role || 'user'}
						onValueChange={(v) => ($form.role = v as 'user' | 'admin')}
						disabled={$delayed}
					>
						<Select.Trigger class="w-full">
							{getRoleLabel($form.role)}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="user">{m.admin_role_user()}</Select.Item>
							<Select.Item value="admin">{m.admin_role_admin()}</Select.Item>
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<div class="flex gap-2 pt-4">
					<Button type="submit" disabled={$delayed}>
						{#if $delayed}
							<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
							{m.admin_users_creating()}
						{:else}
							{m.admin_users_create()}
						{/if}
					</Button>
					<Button variant="outline" href="/admin/users" disabled={$delayed}
						>{m.common_cancel()}</Button
					>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
