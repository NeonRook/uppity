---
version: 1
slug: "src-routes-page-svelte"
primary_target: "src/routes/+page.svelte"
related_targets: []
---

# Landing page (`/`)

**Scope:** the unauthenticated root route. Logged-in visitors are redirected to `/dashboard` by `+page.server.ts`, so this surface is only ever seen by people who have not signed up. **Visitor mode: Persuade.**

## Audience and job

Two audiences at parity, both of whom must find a door in the first viewport:

- **Hosted teams** — organizations evaluating against UptimeRobot, Instatus, Hyperping. They need the price, the capability set, and a reason to believe. Their action is `Start hosted · $12`.
- **Self-hosted operators** — developers who will run it themselves via `docker-compose`. They need the repo, the parity guarantee, and confirmation that nothing is gated. Their action is `Run it yourself`. Before this rebuild they had **no entry point at all** on this page.

## Action and proof

Primary action is a two-door CTA, repeated once at the close. Proof is limited to what actually exists:

- The live dogfooded status page at `uppity.cloud/status/uppity` (real, unfakeable, compounds daily).
- The confirmed pricing table, including capacity blocks.
- The public AGPL-3.0 repository.

There are no customers, testimonials, logos, uptime statistics, or review scores, and none may be invented.

## Chosen direction — "The Wall, Torn Down"

The page puts the confirmed positioning into its structure rather than into a sentence. It names the enemy (the upgrade wall), makes it visible, then breaks it.

Sequence: hero → step chart (focal) → governing principle → capability ledger → live uptime proof → pricing → two doors → footer.

**Memorable moment:** the step chart. Two gray competitor staircases that jump in cliffs as you grow, against one calm emerald slope that does not. It is the argument made visible, using only confirmed figures.

Approved comps: `.impeccable/mocks/comp-c.png` (primary, sidecar marked `approved: true`) with the ledger from `.impeccable/mocks/comp-b.png` grafted beneath the chart. Comps are gitignored as local planning artifacts; this brief is the durable record.

**Must not be literalized from the comps:**

- Comp C's intermediate staircase steps are fabricated. Only two cliffs are confirmed: Instatus $20 → $300, Hyperping → $299. Plot those and nothing else.
- Comp B renders every competitor cell as a dash, which would falsely claim those products lack the capability. They have them; they _gate_ them. Cells must show the tier price at which each capability unlocks.
- Comp A's "$20" for Hyperping's entry price is invented and is not used anywhere.

## Constraints

- **Visual world is fixed.** DESIGN.md's "Quiet Ward" is inherited, not rewritten: zero-chroma neutrals, signal colour only, no resting shadows, 896px marketing column, IBM Plex Sans/Mono, weight ceiling 600 (the hero is the sanctioned Display usage at 300).
- **Say only what is true.** No uptime figure — the published target is still an open decision in PRODUCT.md. No "simple", "simplest", "reliable", or "most reliable" (occupied by Instatus and Better Stack per the Do-not-claim list). No Atlassian Statuspage as a public benchmark.
- **Capacity blocks are treated as shipped** (user direction, 2026-07-31; implemented in parallel): $12 base / 50 monitors, +$8 per additional 50. Worked examples $20 at 100, $84 at 500, $164 at 1,000.
- All copy through Paraglide `m.*` across `en`, `de`, `pt-br`. Design for German (~30% longer) — the previous header broke there.
- Light and dark are equal citizens. Every new surface verified in both.
- Extend `src/lib/components/ui/`; do not introduce a parallel component vocabulary.
- **This page ships no JavaScript.** `+page.server.ts` sets `csr = false` (2026-08-02), so nothing here is hydrated: no client router, no Svelte runtime, no `cn()`/tailwind-merge, no reactive state. Anything added to this surface has to work as server-rendered HTML and CSS. The one exception is the chart's reveal, which is an inline observer in `pricing-cliff-chart.svelte` rather than an attachment — roughly 300 bytes, and the entire client-side budget of the page. A future requirement that genuinely needs hydration is a decision to reverse this, not something to slip in beside it.

## Implementation fidelity inventory

Medium is decided by what the region _is_, not by what is convenient.

| Region            | Comp shows                                                                                 | Medium                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Header            | logo mark + wordmark; `Sign in` text link; `Start hosted` button                           | existing `logo.svg` + shadcn `Button`; semantic HTML                                                                                          |
| Hero headline     | Display, weight 300, `clamp(2.25rem,5vw,3rem)`, lh 1.05, ls −0.02em                        | HTML/CSS + new `--text-display` token in `@theme`                                                                                             |
| Hero CTAs         | solid emerald + hairline outline, side by side                                             | shadcn `Button` (default + outline)                                                                                                           |
| **Step chart**    | hairline axes, two gray staircases with scarlet gate ticks, one emerald slope, mono labels | **authored SVG** — precise geometry, countable elements, must scale/respond and carry an accessible text equivalent. Raster would flatten it. |
| Principle band    | emerald hairline rule + one line                                                           | HTML/CSS                                                                                                                                      |
| Capability ledger | 4 columns × ~10 rows, hairline borders, emerald checks, tier-price cells                   | semantic `<table>` with real `<th>` scope                                                                                                     |
| Uptime strip      | ~90 narrow emerald cells, mono end captions                                                | HTML/CSS flex, reusing the existing uptime-bar pattern                                                                                        |
| Pricing           | Free / $12 / $299 / self-hosted $0                                                         | shadcn `Card`, mono figures                                                                                                                   |
| Footer            | three link columns                                                                         | semantic HTML                                                                                                                                 |

No raster assets required. Every region is code.

## Unresolved

- Whether a separate marketing site should eventually exist. The user confirmed SvelteKit carries this fine (SSR + SEO), so `/` is the marketing surface for now.
- The published uptime target remains open; the page must work without one.
- Whether `/pricing` becomes its own route or stays an anchor on `/`.
