<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { UpdateIncidentForm, AddIncidentUpdateForm } from '$lib/schemas/incident';
	import type { IncidentWithDetails } from '$lib/server/services/incident.service';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		ArrowLeft,
		Loader2,
		Trash2,
		Search,
		Eye,
		Clock,
		CheckCircle2,
		AlertTriangle
	} from '@lucide/svelte';

	interface Props {
		data: {
			incident: IncidentWithDetails;
			updateForm: SuperValidated<UpdateIncidentForm>;
			addUpdateForm: SuperValidated<AddIncidentUpdateForm>;
		};
	}

	let { data }: Props = $props();

	const {
		form: editForm,
		errors: editErrors,
		enhance: editEnhance,
		delayed: editDelayed,
		message: editMessage
	} = superForm(untrack(() => data.updateForm));

	const {
		form: addForm,
		errors: addErrors,
		enhance: addEnhance,
		delayed: addDelayed,
		message: addMessage,
		reset: resetAddForm
	} = superForm(
		untrack(() => data.addUpdateForm),
		{
			onUpdated: ({ form }) => {
				if (form.valid) {
					resetAddForm();
				}
			}
		}
	);

	let showDeleteDialog = $state(false);
	let deleting = $state(false);

	const statusOptions = [
		{ value: 'investigating', label: 'Investigating', icon: Search },
		{ value: 'identified', label: 'Identified', icon: Eye },
		{ value: 'monitoring', label: 'Monitoring', icon: Clock },
		{ value: 'resolved', label: 'Resolved', icon: CheckCircle2 }
	] as const;

	const impactOptions = [
		{ value: 'none', label: 'None' },
		{ value: 'minor', label: 'Minor' },
		{ value: 'major', label: 'Major' },
		{ value: 'critical', label: 'Critical' }
	] as const;

	function getStatusInfo(status: string) {
		switch (status) {
			case 'investigating':
				return { label: 'Investigating', variant: 'destructive' as const, icon: Search };
			case 'identified':
				return { label: 'Identified', variant: 'destructive' as const, icon: Eye };
			case 'monitoring':
				return { label: 'Monitoring', variant: 'secondary' as const, icon: Clock };
			case 'resolved':
				return { label: 'Resolved', variant: 'outline' as const, icon: CheckCircle2 };
			default:
				return { label: status, variant: 'secondary' as const, icon: AlertTriangle };
		}
	}

	function getImpactVariant(impact: string) {
		switch (impact) {
			case 'none':
				return 'outline' as const;
			case 'minor':
				return 'secondary' as const;
			case 'major':
			case 'critical':
				return 'destructive' as const;
			default:
				return 'secondary' as const;
		}
	}

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const statusInfo = $derived(getStatusInfo(data.incident.status));
</script>

<svelte:head>
	<title>{data.incident.title} - Uppity</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" size="icon" href="/incidents">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<div class="flex-1">
			<div class="flex items-center gap-2">
				<h1 class="text-2xl font-bold tracking-tight">{data.incident.title}</h1>
				<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
				<Badge variant={getImpactVariant(data.incident.impact)}>
					{data.incident.impact} impact
				</Badge>
			</div>
			<p class="text-sm text-muted-foreground">
				Started {formatDate(data.incident.startedAt)}
				{#if data.incident.resolvedAt}
					| Resolved {formatDate(data.incident.resolvedAt)}
				{/if}
			</p>
		</div>
		<Button variant="destructive" size="icon" onclick={() => (showDeleteDialog = true)}>
			<Trash2 class="h-4 w-4" />
		</Button>
	</div>

	{#if $editMessage}
		<Alert>
			<AlertDescription>{$editMessage}</AlertDescription>
		</Alert>
	{/if}

	{#if $addMessage}
		<Alert>
			<AlertDescription>{$addMessage}</AlertDescription>
		</Alert>
	{/if}

	<!-- Add Update -->
	{#if data.incident.status !== 'resolved'}
		<Card.Root>
			<Card.Header>
				<Card.Title>Post Update</Card.Title>
				<Card.Description>Add a new update to the incident timeline</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/addUpdate" class="space-y-4" use:addEnhance>
					<div class="space-y-2">
						<Label for="status">New Status</Label>
						<Select.Root
							type="single"
							name="status"
							value={$addForm.status}
							onValueChange={(v) =>
								($addForm.status = v as 'investigating' | 'identified' | 'monitoring' | 'resolved')}
						>
							<Select.Trigger class="w-full">
								{statusOptions.find((s) => s.value === $addForm.status)?.label || 'Select status'}
							</Select.Trigger>
							<Select.Content>
								{#each statusOptions as opt (opt.value)}
									<Select.Item value={opt.value}>{opt.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="status" bind:value={$addForm.status} />
						{#if $addErrors.status}
							<p class="text-sm text-destructive">{$addErrors.status}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="message">Update Message *</Label>
						<Textarea
							id="message"
							name="message"
							placeholder="Provide an update on the current status..."
							bind:value={$addForm.message}
							disabled={$addDelayed}
							rows={3}
							aria-invalid={$addErrors.message ? 'true' : undefined}
						/>
						{#if $addErrors.message}
							<p class="text-sm text-destructive">{$addErrors.message}</p>
						{/if}
					</div>

					<Button type="submit" disabled={$addDelayed || !$addForm.message?.trim()}>
						{#if $addDelayed}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Posting...
						{:else}
							Post Update
						{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Timeline -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Timeline</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="relative space-y-6">
				{#each data.incident.updates as update, i (update.id)}
					{@const updateStatusInfo = getStatusInfo(update.status)}
					{@const UpdateIcon = updateStatusInfo.icon}
					<div class="relative flex gap-4">
						{#if i < data.incident.updates.length - 1}
							<div class="absolute top-8 left-[15px] h-full w-0.5 bg-border"></div>
						{/if}
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
							<UpdateIcon class="h-4 w-4" />
						</div>
						<div class="flex-1 pb-2">
							<div class="flex items-center gap-2">
								<Badge variant={updateStatusInfo.variant} class="text-xs">
									{updateStatusInfo.label}
								</Badge>
								<span class="text-xs text-muted-foreground">
									{formatDate(update.createdAt)}
								</span>
							</div>
							<p class="mt-1 text-sm">{update.message}</p>
						</div>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Affected Monitors -->
	{#if data.incident.affectedMonitors.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>Affected Monitors</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-wrap gap-2">
					{#each data.incident.affectedMonitors as monitor (monitor.id)}
						<Badge variant="outline">
							{monitor.name}
							<span class="ml-1 text-xs opacity-50">({monitor.type})</span>
						</Badge>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Edit Incident -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Edit Incident</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/update" class="space-y-4" use:editEnhance>
				<div class="space-y-2">
					<Label for="title">Title</Label>
					<Input
						id="title"
						name="title"
						bind:value={$editForm.title}
						disabled={$editDelayed}
						aria-invalid={$editErrors.title ? 'true' : undefined}
					/>
					{#if $editErrors.title}
						<p class="text-sm text-destructive">{$editErrors.title}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="impact">Impact</Label>
					<Select.Root
						type="single"
						name="impact"
						value={$editForm.impact}
						onValueChange={(v) => ($editForm.impact = v as 'none' | 'minor' | 'major' | 'critical')}
					>
						<Select.Trigger class="w-full">
							{impactOptions.find((i) => i.value === $editForm.impact)?.label || 'Select impact'}
						</Select.Trigger>
						<Select.Content>
							{#each impactOptions as opt (opt.value)}
								<Select.Item value={opt.value}>{opt.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="impact" bind:value={$editForm.impact} />
					{#if $editErrors.impact}
						<p class="text-sm text-destructive">{$editErrors.impact}</p>
					{/if}
				</div>

				<Button type="submit" disabled={$editDelayed}>
					{#if $editDelayed}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Saving...
					{:else}
						Save Changes
					{/if}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<AlertDialog.Root bind:open={showDeleteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete incident?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete "{data.incident.title}" and all its updates. This action cannot
				be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
					};
				}}
			>
				<Button type="submit" variant="destructive" disabled={deleting}>
					{deleting ? 'Deleting...' : 'Delete'}
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
