---
status: accepted
date: 2026-10-11
---

# API keys use better-auth's plugin, with access read from the plan

Public API requests authenticate with an organization-owned key from
`@better-auth/api-key`. The key proves which organization is calling. What that
organization may do is read from its plan on every request, never from the key.

## Context

The API needs keys that are hashed at rest, shown once, scoped to an organization,
revocable, and rate limited. better-auth already owns users, sessions and organizations
here, and its API key plugin does all five, including keys owned by an organization
rather than a user (`references: "organization"`). Its rate limiter is a compare-and-swap
on the key row, so it holds across web instances without shared memory.

The plugin has three properties that shape how it is wired in:

- It stores `rateLimitMax` on each key at creation. A plan change does not touch it.
- It authorizes org key operations through the organization plugin's access control.
  Owners pass through `allowCreatorAllPermissions`. The default roles carry no `apiKey`
  statement, so without more configuration an admin cannot manage keys.
- It has no cap on keys per owner.

## Decision

**The plan decides access, per request.** The request handler resolves the key to an
organization, then reads that organization's effective limits. `apiAccess: "read"` admits
GET requests; `"full"` admits writes once write endpoints exist. Nothing plan-derived is
stored on a key, so a downgrade takes effect on the next request. The plugin's
`permissions` field stays unused until scoped keys are a feature.

**The rate limit is per key, and resynced lazily.** `PlanLimits.apiRequestsPerMinute` is
60 on Free and 600 on Uppity. `-1`, on Dedicated, Enterprise and self-hosted, resolves to
`UPPITY_API_REQUESTS_PER_MINUTE`. After the plugin verifies a key, the handler compares the
key's stored `rateLimitMax` with the organization's current figure and writes only when
they differ. The billing code stays unaware of API keys, and a key never runs on a stale
limit for longer than one request.

**Keys per organization are capped at 10**, so extra keys do not multiply the limit. The
cap is checked in the create action before the plugin is called. It is abuse protection,
not a priced limit, and is the same on every plan.

**Owners and admins manage keys; members can list them.** The organization plugin gets an
access-control config that extends the default statements with
`apiKey: ["create", "read", "update", "delete"]`, granting all four to owner and admin and
`read` to member.

**`enableSessionForAPIKeys` stays off.** A key authenticates `/api/v1` only. It never mints
a session and never reaches the app, the admin surface, or better-auth's own endpoints.

## Consequences

- **The limit is per burst, not per minute.** The plugin resets a key's count only after
  a full window with no requests, so steady traffic below the limit still runs into it:
  at 40 requests a minute against 60, a key is refused for about a minute after every 60
  requests. Measured locally, and reported upstream as better-auth#11680. Until that is
  fixed, public docs must not describe the figure as "per minute".

- One extra comparison per API request, and a write only after a plan change.
- Rate limiting writes to the key row on every request. At the volumes 60 to 600 requests
  a minute per key allow, this is cheap; `deferUpdates` is available if it is not.
- Moving the limit to the organization later means replacing the plugin's limiter with a
  counter of our own. The per-key cap keeps the two close enough that this is not urgent.
