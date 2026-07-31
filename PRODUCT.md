# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences served by one product at parity (confirmed):

- **Self-hosted operators** — developers and sysadmins running their own instance via `docker-compose`. They own the infrastructure, configure the app through `.env`, and never encounter a paywall: `SELF_HOSTED=true` unlocks every feature and removes all plan ceilings.
- **Hosted (SaaS) teams** — organizations on a managed instance, subject to Free/Uppity/Dedicated limits and billed through Polar.

Both audiences use the same UI. Billing and plan-limit surfaces are conditional, not a separate product. Neither audience gets the compromised experience.

Within an instance there are three operating positions:

- **Organization members** (better-auth `organization` plugin, owner/admin/member) working inside `(app)` — creating monitors, running incidents, configuring notification channels and status pages.
- **Platform administrators** working inside `(admin)` — cross-organization user and org management, audit log review, session management, and user impersonation. Separate login at `/admin/login`.
- **Status page visitors** — unauthenticated customers of the operator's own users, reading a public status page at `/status/[slug]`. They never authenticate and often arrive mid-incident.

## Product Purpose

Uppity watches services and tells people when they break. It checks HTTP endpoints, TCP ports, and push heartbeats on a schedule; records the results; opens and tracks incidents; fans alerts out over email, Slack, Discord, and webhooks; and publishes a customer-facing status page from the same data.

Success is that the operator learns about an outage before their customers do, and that their customers can find out what is happening without opening a support ticket.

## Positioning

**Confirmed 2026-07-30.** Uppity is the monitoring and status page tool with **no upgrade wall**.

> Start hosted for $12. Self-host whenever you want — same product, every feature, forever.

**The enemy is the upgrade wall.** The category gates capability behind maturity events:
Instatus jumps $20 → $300 (15×) with SAML SSO, private pages, and subscriber ceilings all
behind it; Hyperping gates SSO and audit logs at $299; Atlassian Statuspage gates RBAC at
$399 and ladders to $1,499. The triggers — a security questionnaire, an internal status
page, a subscriber count — correlate with a customer's company maturing, not with value
delivered.

**The moment Uppity owns is the upgrade quote, not the signup.** Signup speed is already
owned by Instatus ("takes 30 seconds", with real logos) and undercut by UptimeRobot's
50-monitor free tier. Do not compete there.

**The uncopyable asset** is full-parity self-hosting. `SELF_HOSTED_LIMITS` sets every
ceiling to `-1` and enables SSO and audit logs. A competitor can add a mid-tier overnight;
none can ship a free, full-parity self-hosted build without cannibalising their own top
tier. This claim requires no customers, testimonials, or benchmarks — which is why it is
usable today.

### The governing principle

> **Never gate code. Price commitments, capacity, and human time.**

Features have zero marginal cost, so gating them is rent extraction. SLAs, support,
dedicated infrastructure, and check volume have real marginal cost, so pricing them is cost
recovery. State this publicly — unstated, a support-only Enterprise tier is
indistinguishable from a feature-gated one.

Corollary: **meter what actually costs you, give away what doesn't.** Checks are metered
because check load is the dominant marginal cost. Status pages, seats, and every feature
are free on paid plans because their marginal cost rounds to zero.

### Supporting claims (in priority order)

1. **SSO costs $299/month at Hyperping and $300/month at Instatus. In Uppity it's free — you just have to run it yourself.**
2. Instatus's Business tier gates SAML SSO _and_ its SLA behind the same wall. Uppity gates only the SLA, because one is a feature and one is insurance.
3. Hyperping's $299 buys 1,000 monitors on shared infrastructure. Uppity's $299 buys 2,000 and a dedicated instance.

### Do not claim

- "Fastest setup" or "simplest signup" — occupied by Instatus, and contradicted by our free tier
- "Most reliable" / "best-in-class" — Better Stack owns this with far more substantiation
- Feature breadth against Uptime Kuma (31 monitor types, 90+ integrations, 89.6k stars)
- Atlassian Statuspage as a public benchmark. It performs **no monitoring at all**; naming
  it signals "we make status pages" and invites a brand comparison we lose. Keep it as an
  internal design bar for the public status page surface only.
- Any uptime SLA figure until one has actually been measured (see Capabilities).

Full competitive analysis: `competitor-profiles/_summary.md`.

## Operating Context

- **The scene is an incident.** The highest-stakes moments in this product are read under stress, often on a phone, often at an inconvenient hour. Dashboard, monitor detail, incident detail, and the public status page all have to survive being scanned in a hurry.
- **The routine scene is a glance.** Most sessions are a five-second "is everything still green?" check. Steady-state clarity matters at least as much as incident-state clarity.
- **Configuration is a setup ritual**, not a daily activity. Monitor creation, notification channels, and status page composition are visited rarely and must be legible without recall.
- **Maintenance windows are planned in advance** and suppress alerts while active — a deliberate, scheduled counterpart to the unplanned incident flow.
- Self-hosted operators additionally live in `.env`, `docker-compose`, and container logs; the app runs as three processes (web app, monitor worker, notifier worker).

## Capabilities and Constraints

**Confirmed functionality**

- Monitor types: `http`, `tcp`, `push`.
- Monitor status vocabulary: `up`, `down`, `degraded`, `unknown`. Degraded is response-time driven (`UPPITY_DEGRADED_RESPONSE_TIME_MS`).
- Incident lifecycle: `investigating` → `identified` → `monitoring` → `resolved`.
- Notification channels: `email`, `slack`, `discord`, `webhook`. Events include monitor down/up/degraded, incident created/updated, and SSL expiry warnings.
- Scheduled maintenance windows: `scheduled` → `in_progress` → `completed`, scoped to selected monitors, suppressing alerts while active.
- Public status pages with monitor groups, uptime history (`UPPITY_STATUS_PAGE_HISTORY_DAYS`, default 90), and custom domains on qualifying plans.
- Admin surface: users, organizations, audit log with CSV export, session management, impersonation.
- SSL certificate expiry tracking with a configurable threshold and warning cooldown.
- Live updates over SSE (`/api/sse/monitors`); push check-ins over `/api/webhooks/push`.
- Three locales shipped: `en`, `de`, `pt-br`.

**Plan tiers — confirmed 2026-07-30, implemented 2026-07-31**

> Capacity blocks are not yet implemented: the Uppity ceiling is a fixed 50
> monitors until pass 2 lands. See "Outstanding implementation work" below.

|                      | Free  | **Uppity**                     | **Dedicated**  | Self-hosted |
| -------------------- | ----- | ------------------------------ | -------------- | ----------- |
| Monitors             | 20    | 50 included, **+50 per block** | 2,000 fair use | unlimited   |
| Min interval         | 120s  | 30s                            | 30s            | 30s         |
| Status pages         | 1     | **unlimited**                  | unlimited      | unlimited   |
| Team members         | 5     | **unlimited**                  | unlimited      | unlimited   |
| Retention            | 30d   | 1 year                         | unlimited      | unlimited   |
| Channels             | email | all                            | all            | all         |
| Custom domains       | —     | ✅                             | ✅             | ✅          |
| **SSO + audit logs** | —     | **✅**                         | ✅             | ✅          |
| Full API             | —     | ✅                             | ✅             | ✅          |

**Pricing**

| Unit                          | Monthly | Annual (2 months free) |
| ----------------------------- | ------- | ---------------------- |
| Uppity base (50 monitors)     | $12     | **$120/yr**            |
| Capacity block (+50 monitors) | $8      | **$80/yr**             |
| Dedicated                     | $299    | $2,990/yr              |

Examples: 100 monitors = $20/mo · 500 monitors = $84/mo · 1,000 monitors = $164/mo.

**Enterprise** = Dedicated plus a contractual SLA with service credits, priority support,
onboarding, and invoicing. Negotiated. **Zero feature unlocks** — this is the rule that
keeps the Positioning claim honest.

Fair use on Dedicated is stated as _"2,000 monitors at 30-second intervals, or equivalent
check volume"_ — interval-honest, since 2,000 monitors at 5-minute intervals is a tenth of
the load. Per-monitor billing is safe **only because `UPPITY_MIN_INTERVAL_SECONDS = 30`
caps worst-case cost per monitor**; if that floor ever drops, the billing unit must change.

**Uptime commitments — deliberately laddered**

| Level      | Commitment                                          |
| ---------- | --------------------------------------------------- |
| Free       | Best-effort, explicitly stated                      |
| Paid       | Published target — **number still OPEN, see below** |
| Enterprise | Contractual SLA with service credits                |

**The published uptime target remains an open decision as of 2026-07-30.** Uppity is at
v0.1.0 with days — not quarters — of self-measured data. Do not publish a number until one
has been measured from the live status page. "Target" and "contractual SLA with credits"
are different commitments; the gap between them is where Enterprise revenue lives.

**Outstanding implementation work**

- **Capacity blocks.** `PlanLimits.monitors` is still a static 50 for Uppity. Blocks need a
  `blocks` column on `subscription`, a `monitor_blocks` meter in Polar, a metered price
  stacked on both Uppity products, and a ceiling derived as `50 + 50 × blocks` in
  `getEffectiveLimits`. Polar supports stacking metered prices on fixed ones, which is why
  this mechanism was chosen over the beta seat-pricing feature.
- **First retention sweep after deploy is large.** Retention is now per-plan, so every Free
  organization that accumulated more than 30 days of checks under the old global window loses
  the excess in one statement against the largest table. Schedule the first run in a quiet
  period. The `(monitor_id, checked_at)` index added in `0011` mitigates but does not remove
  this.
- **Enterprise Polar product.** Enterprise has no product and no self-serve path. It is
  reached through Dedicated's contact flow until a first customer exists.
- **Billing is switched off in production.** `uppity-server` runs with `SELF_HOSTED=true`, so
  every plan limit is bypassed: no monitor or member caps, and retention uses the single
  global `UPPITY_CHECK_RETENTION_DAYS` sweep rather than per-plan windows. The catalog and the
  five `POLAR_PRODUCT_*` ids are staged and correct, but nothing in the plan model takes
  effect until this flips.
- **`POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET` are not set in production.** Both are
  required before `SELF_HOSTED` can be turned off: without the token `polarClient` cannot
  create a checkout, and without the webhook secret subscription syncs never land.
- **Flipping `SELF_HOSTED` to false triggers the first per-plan retention sweep**, not the
  code deploy. Every organization holding more than its plan's window loses the excess in one
  statement. Do it in a quiet period.

**Technical constraints**

- SvelteKit 2 / Svelte 5 on Bun; PostgreSQL via Drizzle; better-auth for identity; superforms + **valibot** for form validation; Paraglide for i18n; Tailwind 4.
- Two background workers (`monitor`, `notifier`) run as separate processes from the web app. Anything the UI shows about check freshness depends on them.
- Almost every operational threshold is environment-configurable (`UPPITY_*`); UI must not hardcode values that `.env` owns.

**Explicitly undecided — do not invent**

- Positioning and any competitive or category claim (see above).
- Accessibility standard. No target level (WCAG or otherwise) has been confirmed as a product requirement.
- Whether a public marketing site exists separately from the in-app landing page at `/`.

## Brand Commitments

Confirmed binding by the user:

- **Emerald primary** — `oklch(0.696 0.17 162.48)`, carried through `--primary`, `--ring`, `--chart-1`, and the sidebar tokens in `src/routes/layout.css`. Committed brand, not a scaffold default.
- **Logo** — `src/lib/assets/logo.svg`.
- **Light and dark parity** — `mode-watcher` is wired and both themes are fully tokenized. Every surface must work in both; neither is the afterthought.
- **shadcn-svelte as the component system** — new UI extends `src/lib/components/ui/` and the shadcn-svelte registry rather than introducing a parallel component vocabulary.
- **Localization discipline** — all user-facing copy flows through Paraglide `m.*` messages across `en`, `de`, and `pt-br`. No hardcoded strings in components.

Name: **Uppity**, by NeonRook (`hello@neonrook.com`). No confirmed voice or tone guide yet.

## Evidence on Hand

- Real product assets: `src/lib/assets/logo.svg`, `static/apple-touch-icon.webp`, `static/icons/`, `static/manifest.webmanifest`.
- Real repository presence: public GitHub repo under `NeonRook/uppity`, AGPL-3.0-only license, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
- Real internal planning record: `docs/superpowers/specs/` and `docs/superpowers/plans/`, plus `docs/rfc-001-monitor-scheduler-architecture.md`. Local artifacts, not published material.
- Real pricing: the table above is a confirmed product decision and is safe to display once implemented.
- **Live dogfooded status page: <https://uppity.cloud/status/uppity>** (since 2026-07-30).
  Uppity monitoring itself, publicly. This is the first real evidence asset — self-
  demonstrating rather than asserted, and it compounds: every month it runs is proof that
  cannot be bought or fabricated. It is also the measurement channel that will eventually
  justify a published uptime target.
- Real unit economics: `docs/pricing-cost-model.md` — Railway-measured infrastructure
  baseline plus a derived cost model. Internal; not for publication.

**Absences that must not be fabricated:** there are no customers, testimonials, case studies, logos, press mentions, user counts, uptime statistics, review scores, or benchmark results. Version is `0.1.0`. Any surface needing social proof must either use real content the user supplies or be designed to work without it.

## Product Principles

1. **Parity is the product.** Self-hosted and hosted are one experience. Plan-limit and billing UI is conditional chrome that disappears cleanly under `SELF_HOSTED`; it is never load-bearing to the layout or the task.
2. **Design for the bad night.** The incident-state reading of any surface is the one that matters. Status must be legible at a glance, under stress, on a small screen, without interpretation.
3. **Green is quiet, red is loud.** Steady state should be calm and low-contrast in its signaling; only real degradation earns visual weight. Alarm inflation destroys the signal.
4. **The status page is the customer's product, not ours.** It is read by people who do not know Uppity exists and do not care. It answers "is it broken, and do they know?" before it does anything else.
5. **Say only what is true.** No fabricated proof, no invented positioning, no numbers the database cannot produce.
