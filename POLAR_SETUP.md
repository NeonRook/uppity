# Polar Setup

Status of the Polar billing integration, what changed, and what still has to happen
before paid plans work on production.

> **This integration runs against the live production Polar environment when
> deployed.** Real cards are charged. Local development runs against sandbox,
> which is a completely separate system with its own token, product IDs and
> webhook secrets.

## How billing is wired

Uppity does **not** use hand-rolled `/checkout` and `/api/webhook/polar` routes.
Polar is mounted through the `@polar-sh/better-auth` plugin in
`src/lib/server/auth.ts`, which registers these endpoints under better-auth's
base path:

| Endpoint                         | Purpose                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `POST /api/auth/checkout`        | Creates a checkout session, called from the billing page |
| `POST /api/auth/polar/webhooks`  | Receives and verifies all Polar webhooks                 |
| `GET  /api/auth/customer/portal` | Redirects to Polar's hosted customer portal              |
| `POST /api/auth/usage/ingest`    | Usage/meter events                                       |

Checkout is initiated client-side from `src/routes/(app)/settings/billing/+page.svelte`
via `authClient.checkout({ slug, referenceId })`. There is no
`?products=<id>` link form — checkout is **slug**-based (`uppity-monthly`,
`uppity-annual`, `dedicated-monthly`, `dedicated-annual`).

### Why `referenceId` matters

Uppity bills **per organization** (`subscription.organizationId` is unique), but
Polar's model is customer-centric. The checkout call stuffs the Uppity org ID
into `metadata.referenceId`, and every webhook handler reads it back out to find
the organization. A checkout that omits `referenceId` produces a subscription
this app structurally cannot attribute, so the customer pays and receives
nothing. Any new checkout path must set it.

Those unattributable events are logged at **error** level and dropped. They are
dropped rather than retried because the reference is missing from the payload
itself — a Polar retry would replay the same event forever — and logged loudly
because the failure is silent revenue loss otherwise. Grep for
`without org reference`.

### Why `external_customer_id` is not used for this

`external_customer_id` is already taken: `@polar-sh/better-auth` hardcodes it to
the **better-auth user ID** at checkout, and its portal, customer-state, orders
and subscriptions endpoints all look the customer up by that same user ID. It
cannot be repurposed as the organization ID without breaking those endpoints.
It would also be ambiguous — a user may own up to `ORGANIZATION_LIMIT_PER_USER`
(default 5) organizations, so a customer maps to no single one. This is why
`onCustomerStateChanged` deliberately records no `org_id`.

## Files changed

| File                                                          | Change                                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/polar.ts`                                     | **New.** Single shared `Polar` client + `polarServer` resolution                                                                 |
| `src/lib/server/auth.ts`                                      | Imports the shared client; adds `onOrderPaid` and `onCustomerStateChanged` handlers; raises unattributable events to error level |
| `src/lib/server/services/meter.service.ts`                    | Uses the shared client instead of constructing its own                                                                           |
| `src/routes/(admin)/admin/organizations/[id]/+page.server.ts` | Uses the shared client instead of constructing one per call                                                                      |
| `src/lib/server/logger/types.ts`                              | `WebhookWideEvent` gains `polar_order_id`, `polar_product_id`, `active_subscription_count`                                       |
| `src/app.d.ts`                                                | Declares `POLAR_SERVER`                                                                                                          |
| `.env.example`                                                | Documents `POLAR_SERVER`; clarifies which webhook secret to use                                                                  |
| `.env`                                                        | Adds `POLAR_SERVER=sandbox` (local dev targets sandbox)                                                                          |

Previously `new Polar({...})` was constructed in three places, each hardcoding
`server: import.meta.env.DEV ? "sandbox" : "production"`. That made the target
environment a function of the build mode, so a dev server could never reach
production and a production build could never reach sandbox. It is now one
client reading `POLAR_SERVER`.

## Environment keys

Names only — never commit values. All are optional; absent means billing is off
(self-hosted mode).

| Key                               | Notes                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POLAR_ACCESS_TOKEN`              | Organization access token. Sandbox and production tokens are not interchangeable                        |
| `POLAR_SERVER`                    | `sandbox` or `production`. **Defaults to `production`** when unset                                      |
| `POLAR_WEBHOOK_SECRET`            | Signing secret of the endpoint pointing at `/api/auth/polar/webhooks`. Each endpoint has its own secret |
| `POLAR_PRODUCT_FREE`              |                                                                                                         |
| `POLAR_PRODUCT_UPPITY_MONTHLY`    |                                                                                                         |
| `POLAR_PRODUCT_UPPITY_ANNUAL`     |                                                                                                         |
| `POLAR_PRODUCT_DEDICATED_MONTHLY` |                                                                                                         |
| `POLAR_PRODUCT_DEDICATED_ANNUAL`  |                                                                                                         |

`POLAR_SERVER` defaulting to `production` is deliberate: a deployment that never
sets it keeps working. It also means **local `.env` must set
`POLAR_SERVER=sandbox` explicitly**, which it now does.

`POLAR_ACCESS_TOKEN` and `POLAR_SERVER` are required on **both** the
`uppity-server` and `worker-monitor` Railway services, not just `uppity-server`.
The `usage-snapshot` maintenance job — the only code path that calls
`events.ingest` — runs on `worker-monitor` (see [Usage meters](#usage-meters)),
so that service needs its own copy of both variables to report anything. This
is the same lesson as `SELF_HOSTED` above: each Railway service has its own
variable set, and code that assumes `uppity-server`'s configuration also
applies to the worker is wrong.

A token present without `POLAR_SERVER` set falls back to `production` (see
`src/lib/server/polar.ts`), so a sandbox token on `worker-monitor` without an
accompanying `POLAR_SERVER=sandbox` would 401 on every ingest rather than
silently doing nothing — the opposite failure mode from an absent token, and
worth telling apart when debugging.

### Token scopes

`POLAR_ACCESS_TOKEN` needs exactly the capabilities the running app calls:

| Polar API call               | Called by                                        | Capability                |
| ---------------------------- | ------------------------------------------------ | ------------------------- |
| `checkouts.create`           | plugin checkout endpoint                         | checkouts — write         |
| `customerSessions.create`    | portal, and every `customerPortal.*` read        | customer sessions — write |
| `customers.getStateExternal` | plugin customer-state endpoint                   | customers — read          |
| `subscriptions.list`         | plugin subscriptions endpoint                    | subscriptions — read      |
| `subscriptions.get`          | `admin/organizations/[id]` resync action         | subscriptions — read      |
| `events.ingest`              | `meter.service.ts`, via the `usage-snapshot` job | events — write            |

Deliberately **excluded**:

- **Products.** Product IDs come from `POLAR_PRODUCT_*` and are passed straight
  into `checkouts.create`; no code path reads or writes the products API. Products
  write on a runtime token would let a leaked token re-price the live catalogue.
- **Webhooks.** Inbound webhooks are verified by HMAC against
  `POLAR_WEBHOOK_SECRET`; the access token plays no part in receiving them. The
  scope only permits managing endpoints through the API.

The portal, benefit-grant, order and meter listings need no scope of their own —
each is preceded by `customerSessions.create` and authenticated by that ephemeral
customer session rather than the organization token.

Provisioning scripts are a separate concern: give them their own short-lived
token with products write and delete it when done.

## Usage meters

The `usage-snapshot` maintenance job (`MeterService.reportUsageSnapshots`,
scheduled from `src/worker/monitor/maintenance.ts`) reads current resource
counts once a day (`collectUsageSnapshots`, one row per organization) and
emits **two** Polar event streams from that single query. Free organizations
are excluded from both: they have no `subscription.polarCustomerId`, and
`collectUsageSnapshots` only selects organizations that do.

### `usage_snapshot` — the billable stream, summed per customer

`subscription.polarCustomerId` is not unique per organization: Polar customers
are keyed by the better-auth user ID, and one user may own several
organizations (up to `ORGANIZATION_LIMIT_PER_USER`). Emitting one event per
organization would let `max` report the largest single organization's usage
instead of the customer's total, so `sumByCustomer` sums `monitors`,
`status_pages` and `team_members` across every organization a Polar customer
owns before this stream is emitted — one event per customer, not per
organization. `organization_count`, also carried in the event's metadata,
records how many organizations each event's totals span; it exists for
diagnostics and is not backed by a meter.

**The three Polar meters in sandbox key on this event and these property
names.** Do not rename the event or its metadata fields without re-provisioning
the meters (`scripts/polar-usage-meters.sh`).

| Meter          | Aggregation               |
| -------------- | ------------------------- |
| `Monitors`     | `max` over `monitors`     |
| `Status Pages` | `max` over `status_pages` |
| `Team Members` | `max` over `team_members` |

Each filters on event name `usage_snapshot`. `max` reports peak usage within
the billing period — defensible on an invoice — rather than `avg`, which
prorates mid-period changes and is easier to game.

### `usage_snapshot_org` — the per-organization audit trail, deliberately unmetered

One event per organization, unsummed, carrying `organization_id`, `monitors`,
`status_pages` and `team_members` in its metadata (no `organization_count` —
that field only means something once rows have been collapsed). It exists
purely so per-organization usage history stays queryable in Polar's event
stream after `usage_snapshot` has summed that detail away; it is not read by
any billing logic and has no meter of its own.

**Do not point a meter at `usage_snapshot_org` expecting a billable number.**
For any Polar customer that owns more than one organization, this stream
emits one event per organization while `usage_snapshot` emits one summed
event — a meter aggregating `usage_snapshot_org` would double-count (or worse,
for `max`, over-report) relative to the summed stream. `METER_EVENTS.USAGE_SNAPSHOT_ORG`
exists in `meter.service.ts` precisely so this event name has a single,
grep-able source of truth, but adding a filter for it to
`scripts/polar-usage-meters.sh` is a deliberate non-goal.

Both streams are ingested independently in the same chunked, never-throwing
path: a failure ingesting one never prevents or is masked by the other.
`reportUsageSnapshots` returns `{ customerSnapshots, organizationSnapshots }`
rather than a single combined count, for the same reason — the two numbers
count different things (billable customers vs. audited organizations) and
summing them would be meaningless. The maintenance job records
`customerSnapshots` as `records_processed` and `organizationSnapshots` as
`org_records_processed`.

These replace four retired meters that counted `monitor_created`,
`monitor_deleted`, `status_page_created` and `status_page_deleted` events: a
count of creations cannot express how many resources currently exist, and
Polar cannot subtract one meter from another. The retired meters are
archived, not deleted — the meters API has no delete verb. `DELETE
/v1/meters/{id}` returns 405, and `PATCH` with `archived_at` is silently
accepted (HTTP 200) but has no effect, because `archived_at` isn't part of
the `MeterUpdate` schema. The schema's actual field is `is_archived`;
`PATCH /v1/meters/{id}` with `{"is_archived": true}` is what archives a meter.

`scripts/polar-usage-meters.sh <sandbox|production>`
provisions the three meters and archives the four retired ones. It is safe to
re-run: creation is skipped when an unarchived meter of that name already
exists, and archiving is skipped when the meter is absent or already
archived. Meters do not replicate between environments, so the script must be
run once against sandbox and once against production.

**Sandbox: provisioned.** `Monitors`, `Status Pages` and `Team Members` exist,
unarchived, with the aggregations above; the four retired meters are archived.

Verified end-to-end 2026-07-31: a local organization's `subscription` row was
temporarily pointed at the one real customer in sandbox
(`3e3fd227-4c57-47a2-b6b6-fbfc6dae6dec`, `uppity-test@mailinator.com`) with
`planId` set to a paid plan, then reverted immediately after. Running
`MeterService.reportUsageSnapshots()` against it ingested one event on each
stream, confirmed via `GET /v1/events/` against `sandbox-api.polar.sh`:

- `usage_snapshot` — non-null `customer_id`, metadata
  `{"monitors": 1, "status_pages": 1, "team_members": 1, "organization_count": 1}`
  (all four properties).
- `usage_snapshot_org` — same `customer_id`, metadata
  `{"monitors": 1, "status_pages": 1, "team_members": 1, "organization_id": "P8z2W1j6LBrAFlVgHMxp4"}`.

Sandbox also still holds one older `usage_snapshot` event from before this
work, metadata `{"monitors": 0, "status_pages": 0, "team_members": 1}` — three
properties, no `organization_count`, predating the summed-customer stream.

**Production: not yet run.** The production access token lives on the
`uppity-server` Railway service, not in local `.env`. Run
`POLAR_ACCESS_TOKEN=<production token> ./scripts/polar-usage-meters.sh production`
and verify with the same meters listing query against `https://api.polar.sh`.
If production never had the four create/delete meters provisioned, the
archive step reporting `skip` for each is the expected outcome, not a failure.

## Current state

### Sandbox — complete except webhooks

All five product IDs in `.env` resolve against `sandbox-api.polar.sh`, and prices
match `src/lib/constants/plans.ts`:

| Product            | ID                                     | Price     |
| ------------------ | -------------------------------------- | --------- |
| Free               | `9114a17a-f0db-49cf-a188-53807a67e6c9` | $0        |
| Uppity             | `b0da7b4f-7c13-43f5-8325-f08f125d3d9c` | $12.00    |
| Uppity (Annual)    | `e419d94d-6200-4dec-a006-135475edd0ac` | $120.00   |
| Dedicated          | `7ed4e4b8-4e6c-4000-9c95-71d48ece4cf0` | $299.00   |
| Dedicated (Annual) | `05d4b061-6593-4844-857a-c88c2a3764bb` | $2,990.00 |
| Enterprise         | `da84a5f2-19c1-48e0-bba0-04db7fd1dfb4` | archived  |

**Zero webhook endpoints are registered in sandbox**, and `POLAR_WEBHOOK_SECRET`
is unset locally, so the webhook path has never been exercised in development.
`webhooks({ secret: process.env.POLAR_WEBHOOK_SECRET ?? "" })` means an unset
secret fails signature validation rather than crashing at boot — silent, not loud.

### Production — configured, billing live

The production catalogue matches `src/lib/constants/plans.ts`. It had drifted badly before
this work: no annual products at all, `Uppity` priced at $14.90, and an `Enterprise` at
$49.50/mo that mapped to no tier. `Uppity` was repriced to $12 and `Enterprise` renamed and
repriced into `Dedicated`, both keeping their product IDs, so the configured
`POLAR_PRODUCT_*` values stayed valid.

| Product            | ID                                     | Price     |
| ------------------ | -------------------------------------- | --------- |
| Free               | `8a2388a1-3fe6-4b38-9b56-71e04b38c1f3` | $0        |
| Uppity             | `a818ebe5-b290-4f69-befa-00b87ab8b064` | $12.00    |
| Uppity (Annual)    | `13ff6413-a022-45b0-a4c7-952c3a4f6aed` | $120.00   |
| Dedicated          | `2e0b74ad-cc18-48ed-a9be-917fbd1970d2` | $299.00   |
| Dedicated (Annual) | `4abe8d31-e5d7-4644-b26f-610f43c99e40` | $2,990.00 |
| Self-Hosted        | `bfd5dc5e-1e67-4865-a157-354c2cb621ec` | archived  |

`SELF_HOSTED` has been **removed** from `uppity-server`. `isSelfHosted()` tests
`=== "true"`, so unset evaluates false and every plan limit is now enforced. Note it was
never set on `worker-monitor` at all, so retention there has taken the per-plan path since
the code deployed.

## Outstanding work

- [x] **Rotate the `Postgres-18` password.** Done — the production `DATABASE_URL` had been
      exposed during this setup session.
- [x] Confirm the five **production** product IDs. Provisioned and verified; see the table
      above. `docs/superpowers/pricing/polar-production-migration.sh` did this with a
      separate token carrying products write.
- [x] Set on the `uppity-server` Railway service: `POLAR_ACCESS_TOKEN`,
      `POLAR_SERVER`, `POLAR_WEBHOOK_SECRET` and the five `POLAR_PRODUCT_*` IDs.
      The two secrets are **sealed**, so they do not appear in the API's variable listing —
      absence there is not evidence they are unset.
- [x] Verify `SELF_HOSTED` is not `true` on `uppity-server`. It has been removed entirely.
- [x] Register a webhook endpoint at `https://uppity.cloud/api/auth/polar/webhooks`.
- [ ] Set `POLAR_ACCESS_TOKEN` and `POLAR_SERVER=production` on the `worker-monitor`
      Railway service. `MeterService.enabled` requires `POLAR_ACCESS_TOKEN`; without it
      `reportUsageSnapshots()` returns `{ customerSnapshots: 0, organizationSnapshots: 0 }`
      without logging anything, the `usage-snapshot` job records
      `records_processed: 0` and reports success, and no event ever reaches Polar —
      indistinguishable from having no paying customers.

- [x] **The webhook endpoint's format and event subscriptions.** Verified 2026-07-31:
      `https://uppity.cloud/api/auth/polar/webhooks`, format `raw`, subscribed to all six
      events the handlers need — including `order.paid` and `customer.state_changed`, which
      are absent from Polar's default set. Re-check after any dashboard change with
      `docs/superpowers/pricing/polar-check-webhooks.sh`.

### Still to confirm

- [ ] **That the runtime token carries only the five capabilities** in
      [Token scopes](#token-scopes), and specifically not products or webhooks. If the
      provisioning token was reused, Railway is holding one that can re-price the live
      catalogue. Listing webhook endpoints requires `webhooks:read`, so whichever token ran
      the verification above has that scope — expected of the provisioning token, a finding
      if it is also the one Railway holds.

- [ ] **That the webhook secret is correct.** A wrong secret fails signature validation
      rather than crashing: Polar sees non-2xx, retries, and eventually disables the
      endpoint, while the logs look like ordinary rejected requests. Sending a test event
      from the Polar dashboard and confirming a wide event with `webhook_source: "polar"` is
      the only check that actually proves it.

- [ ] **Run `scripts/polar-usage-meters.sh production`.** The three
      usage meters (see [Usage meters](#usage-meters)) are provisioned in sandbox only; the
      production access token is not available outside the `uppity-server` Railway service,
      so this has to be run by whoever has it.

## Verify before merging

- [ ] `bun run check` — passes (0 errors)
- [ ] `bun run lint:ci` — exits 0
- [ ] `mise run test` — 197 tests pass
- [ ] Local dev still reaches sandbox: `bun run dev`, open `/settings/billing`,
      confirm plan cards render and the upgrade button opens a Polar sandbox
      checkout
- [ ] Admin resync still works: `/admin/organizations/<id>` → "Resync subscription"
      on an org with a `polarSubscriptionId`
- [ ] After deploying, send a test event from the Polar dashboard to the
      registered endpoint and confirm a `webhook` wide event is logged with
      `webhook_source: "polar"`

## Testing checkout without a real charge

A plain checkout link cannot pre-apply a discount — the code must be typed on
the Polar-hosted checkout page.

A 100% forever discount already exists **in sandbox**: code `UPPITYTEST100`
(`b6b535a2-b2ab-40a8-a4d0-c0896d825c47`). It does not exist in production; create
a separate one there if you want the same flow against live products, and archive
it afterwards.

## Customer portal

No app code needed. Polar hosts the customer portal and emails customers a link
to it. Uppity additionally exposes an in-app "Manage billing" button on
`/settings/billing`, which appears once the organization has a
`polarCustomerId`.
