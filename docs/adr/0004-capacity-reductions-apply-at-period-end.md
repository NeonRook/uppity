---
status: accepted
date: 2026-09-08
---

# Capacity reductions apply at the end of the billing period

Raising a capacity block count takes effect immediately. Lowering it does not: the new
count is held aside and applied when the subscription's period rolls. Until then the
customer keeps the ceiling they are being billed for.

This is the opposite of what a reader would expect from a settings control, so it is
recorded here.

## Context

Polar's `metered_unit` price bills `unit_amount × meter_value`, and the `Monitor Blocks`
meter aggregates `max` over the reported count across the billing period. A peak, once
reached, is what gets charged. Nothing reported later in the same period can lower it.

`subscription.blocks` feeds `getEffectiveLimits` directly, so writing a smaller number
drops the monitor ceiling the instant it lands. Combine the two and the immediate-write
behaviour reads: lose the capacity now, pay for it anyway, for the rest of the period.

On the annual product this is not a rounding error. `meter_interval` is settable on
neither product create nor product update, so the meter's window is the subscription's
own — a full year. A customer who holds four blocks for one day is billed four blocks at
renewal eleven months later.

## Decision

**Reductions are deferred, increases are not.** A pending lower count lives in a nullable
`scheduled_blocks` column on `subscription`. `NULL` means nothing pending. The date it
applies is read from `currentPeriodEnd` and is deliberately not stored a second time:
Polar moves periods, and a copy would drift from the thing it copied.

**The renewal webhook applies it, and a daily sweep catches what the webhook missed.**
At renewal Polar's `subscription.updated` webhook moves `currentPeriodEnd` to the new
period's end. A sweep gated on `currentPeriodEnd <= now` alone would almost never see a
due reduction, because the webhook has already pushed the date forward by the time the
sweep runs. So `syncFromPolar` applies a pending reduction when a sync carries the
subscription into a new period. The `usage-snapshot` maintenance job keeps a set-based,
idempotent sweep in the shape of `MaintenanceWindowService.runStatusTransitions` for the
case where that webhook never arrives. Polar's webhook has no retry we control, and the
daily pass repairs itself.

**The sweep applies before it reports.** If `reportBlocks` runs first in the new period it
meters the old peak, and the reduction the customer asked for costs them another full
period. This is an ordering constraint inside one job, which is the easiest kind of
constraint to break by accident.

**`SubscriptionService` remains the only writer of `blocks`.** ADR 0002 made that column
single-writer on purpose, and a scheduled reduction is exactly the sort of thing that
quietly adds a second one. `setBlocks` is the only path that raises the count. The
webhook path and the sweep live beside it in the same service and only ever lower it, to
a value `setBlocks` already accepted. A sweep that called `setBlocks` once per row was
rejected because it gives up the single set-based update.

A subscription with no known period end has no date to schedule against, and neither
path would ever apply a reduction stored there. A reduction on one applies immediately.

## Consequences

`blocks` stops being one number. It is now "what you hold" plus "what you will hold", and
any surface showing capacity has to show both or it will mislead someone who just pressed
the minus button.

A reduction can land on an organization that has since grown past the smaller ceiling. It
applies anyway. `downgradeToFree` already leaves organizations above their ceiling and
nothing in the product deletes monitors — enforcement only refuses new ones — so this is
an existing, tolerated state rather than a new one. The grace period that makes it humane
is tracked separately.

`setBlocks`'s `over_capacity` refusal loses its last caller. Nothing reaches it once every
reduction is deferred, and a guard that cannot fire is worse than no guard, because it
reads as protection.

The deferral is invisible to Polar. Polar sees a count that stops falling until a period
boundary, which is indistinguishable from a customer who simply did not change anything.
Nothing needs to be provisioned or configured on that side.

## Revisit when

Polar makes `meter_interval` settable, or exposes an aggregation other than `max` for this
price shape. Either would let a mid-period reduction reduce the bill, and the whole
deferral could go away in favour of writing the number the customer asked for.
