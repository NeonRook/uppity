---
status: accepted
date: 2026-10-12
---

# Check results go through one processor, and the workers stay TypeScript

Every check result is a `monitor_check` row, whoever produced it, and one processor in the
monitor worker interprets those rows. The workers stay TypeScript on Node (ADR 0008). The
probe is the only part that may later move to a native language, and the row is its contract.

## Context

A Rust rewrite of both workers was decided and partly built. Each step needed another
compromise:

- The notifier renders with the same email helpers as the web tier.
- Three maintenance jobs (Polar usage, capacity grace, retention cleanup) run on billing and plan
  logic that only exists in TypeScript.
- Status transitions, auto-incidents and maintenance gating would have existed in both
  languages, because the web tier and the push webhook touch the same state.

A map of the worker's dependencies showed why. The worker does five jobs, and only one is
independent of the rest of the code:

| Job                                                                      | Coupling                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Probing: dial, TLS, timing, certificate                                  | None                                                                    |
| Scheduling: claim, lease, backoff, dead letter                           | Column contract; the web tier resets schedules and reads the lease      |
| Interpreting results: transitions, incidents, maintenance gating, events | Domain logic; the push webhook already does part of it, separately      |
| Maintenance jobs                                                         | Five are SQL; three need billing logic                                  |
| Notifications: rendering and delivery                                    | Shares event payloads with three writers and email helpers with the web |

The rewrite cut at the process boundary. The real seam is between probing and everything else.

The separate interpretation in the push webhook is also a bug. It writes `monitor_status` as
`up` directly, so the worker's next check sees no change: a push monitor that recovers sends no
"up" notification and never auto-resolves its incident.

## Decision

- **A result is a row.** The HTTP and TCP probes write `monitor_check` rows. The push webhook
  writes one per heartbeat and nothing else.
- **One processor interprets rows.** It runs in the monitor worker, picks up new rows by
  `LISTEN` with a sweep behind it, and owns every write to `monitor_status`, every auto-incident
  and every monitor event. Push results get the same transitions, maintenance gating and events
  as probed ones.
- **The lease has one definition**, in SQL, read by the claim query and by the overdue check.
- **The probe is hardened in TypeScript.** On Node, undici's connect hook can refuse private
  addresses after DNS resolution and on each redirect hop, and its diagnostics channels give
  per-phase timings.

## Considered options

**Rewrite both workers in Rust (with Diesel).** A spike on 2026-10-12 measured Rust and Go
probes at the same latency, with Rust at 5MB idle and 2.6MB on disk. Interpretation would have
been written twice, and the billing jobs and rendering would still have needed a TypeScript
process. That makes three processes, with domain logic split across two languages.

**Go.** It is the more natural fit for probing, but has the same coupling problem as Rust. The
maintainer also cannot review it with confidence.

**A Rust prober now.** A Rust prober that claims, probes and writes rows is clean once this
refactor exists. Before it, it would inherit the coupling above. It stays possible later: it
replaces the probe and the claim, and the processor does not change.

## Consequences

- A status change waits for one database round trip after the row is written.
- The processor is the only writer of `monitor_status`. Any new kind of result goes through it.
