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

### Production — not configured

The `uppity-server` Railway service has **no `POLAR_*` variables at all**.
Checkout and webhooks are both non-functional on https://uppity.cloud until the
Outstanding work below is done.

## Outstanding work

- [ ] **Rotate the `Postgres-18` password.** The production `DATABASE_URL` was
      exposed during this setup session.
- [ ] Create a **production** organization access token at
      https://polar.sh/dashboard/neonrook/settings (scopes: products, checkouts,
      webhooks — read and write).
- [ ] Confirm the five **production** product IDs. Sandbox IDs will not work.
      `docs/superpowers/pricing/polar-production-migration.sh` provisions and
      prints them.
- [ ] Register a webhook endpoint at
      `https://uppity.cloud/api/auth/polar/webhooks`, format **raw**, subscribed
      to at minimum: `subscription.created`, `subscription.updated`,
      `subscription.canceled`, `subscription.revoked`, `order.paid`,
      `customer.state_changed`.
      **The last two are new** — the handlers exist but will never fire unless
      the endpoint subscribes to them.
- [ ] Set on the `uppity-server` Railway service: `POLAR_ACCESS_TOKEN`,
      `POLAR_SERVER=production`, `POLAR_WEBHOOK_SECRET` (from the endpoint above),
      and the five `POLAR_PRODUCT_*` IDs.
- [ ] Verify `SELF_HOSTED` is not `true` on `uppity-server` — it short-circuits
      every limit check to the unlimited self-hosted plan and disables meter
      reporting.

## Verify before merging

- [ ] `bun run check` — passes (0 errors)
- [ ] `bun run lint:ci` — exits 0
- [ ] `mise run test` — 181 tests pass
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
