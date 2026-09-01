---
status: accepted
date: 2026-09-01
---

# Uppity owns the capacity-block count; Polar only meters it

`subscription.blocks` is written by Uppity and reported outbound to a Polar meter. Polar
never holds an authoritative block count, and nothing about blocks flows back in over a
webhook.

This inverts the direction every other billing field runs in, and the code said the opposite
before this was written down, so it is recorded here.

## Context

NEO-33 added `blocks` to `subscription` and derived the Uppity monitor ceiling from it. Its
doc-comment described the column as "written from Polar subscription state, never by hand",
and NEO-34 was specified as "webhook path updates `subscription.blocks` on change". Both
assumed Polar would be told a quantity and would tell us back — which is how `planId` and
`status` work, and a reasonable thing to assume from the outside.

Polar's metered pricing does not work that way. A `metered_unit` price bills
`unit_amount × meter_value`, and the meter value is computed entirely from events the
application ingests. There is no field on a subscription holding "how many blocks", no API
to set one, and therefore no webhook that could carry one. The only writer of that number is
whoever calls `events.ingest`.

PRODUCT.md chose stacked metered prices over Polar's beta seat-based pricing. That choice is
what settles the direction: seat-based pricing _does_ give Polar an authoritative quantity,
updatable through the API and readable off the subscription. Metered pricing does not, and
reopening that trade for this reason alone was rejected — seats are still in beta, and the
per-monitor unit is not a seat.

## Decision

**The database is the source of truth.** `SubscriptionService.setBlocks` is the only writer,
plus `downgradeToFree` clearing it. `syncFromPolar` has no `blocks` field in its payload and
must never grow one: a webhook could only ever overwrite the truth with a guess.

**The meter is an outbound reflection.** `MeterService` emits a `monitor_blocks` event
carrying the customer's summed block count. The `Monitor Blocks` meter aggregates `max` over
that property, and a metered price on each Uppity product bills against it.

**Reporting is a heartbeat, not a change feed.** Polar meters reset at the start of every
billing period, so a standing purchase that nobody touches would meter zero in the next
period and be billed nothing. The daily `usage-snapshot` maintenance job re-reports every
block-eligible customer's current count, unconditionally and forever. `setBlocks` callers
additionally report immediately, because the daily job may not run again before a period
rolls over and a customer who buys capacity an hour before renewal would otherwise get the
period free.

**Zero is reported explicitly.** A customer who removes their last block needs a `0` in the
new period. Filtering those rows out looks like an optimisation and is a billing bug: to a
`max` aggregation, no event and no purchase are the same thing.

## Consequences

The Polar dashboard is not a place to look up how much capacity a customer has bought. It
shows what was last metered, which lags the database by up to a day for anything the
immediate path missed. `subscription.blocks` is the answer.

Renaming the `monitor_blocks` event or its `blocks` property silently stops billing capacity
rather than failing loudly — the meter simply matches nothing. `scripts/polar-capacity-blocks.sh`
provisions the meter, and `meter.service.spec.ts` asserts the wire format against literal
strings rather than the `METER_EVENTS` constant so a rename cannot pass green.

Metered usage bills on the subscription's own interval, because `meter_interval` is settable
on neither product create nor product update. On the annual product that means the meter's
window is a full year: `max(blocks) × $80` is charged at renewal however briefly the blocks
were held. This matches the published $80/yr price and is a genuine property of an annual
commitment, but it is a surprise on an invoice nine months later, so the billing UI has to
state it.

A Polar customer is the better-auth user, who may own several organizations. Two
block-eligible subscriptions under one customer both carry the metered price and both bill
against the same customer meter, which has no per-subscription scoping. `MeterService` logs
at error level when it sees a customer spanning more than one, because the failure is an
incorrect invoice and nobody finds those by reading a warning stream. POLAR_SETUP.md carries
the detail.

## Revisit when

Polar exposes a subscription-scoped meter, or takes seat-based pricing out of beta with a
unit that fits per-monitor capacity. Either would let Polar hold the count, and the
heartbeat and its failure modes could go away.
