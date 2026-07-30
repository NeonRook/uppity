---
name: Uppity
description: Uptime monitoring that stays quiet until it shouldn't.
colors:
  primary: "oklch(0.696 0.17 162.48)"
  primary-foreground: "oklch(0.985 0 0)"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.145 0 0)"
  popover: "oklch(1 0 0)"
  sidebar: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  accent: "oklch(0.95 0.052 163.051)"
  accent-foreground: "oklch(0.378 0.077 168.94)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.922 0 0)"
  ring: "oklch(0.696 0.17 162.48)"
  status-up: "oklch(0.696 0.17 162.48)"
  status-degraded: "oklch(0.769 0.188 70.08)"
  status-partial: "oklch(0.705 0.213 47.604)"
  status-down: "oklch(0.577 0.245 27.325)"
  status-maintenance: "oklch(0.623 0.214 259.815)"
  status-unknown: "oklch(0.708 0 0)"
typography:
  display:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3rem)"
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  readout:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  hairline: "4px"
  tight: "8px"
  snug: "12px"
  base: "16px"
  loose: "24px"
  section: "32px"
  page: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "oklch(0.696 0.17 162.48 / 90%)"
    textColor: "{colors.primary-foreground}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-outline-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "oklch(1 0 0)"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "oklch(1 0 0)"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  status-dot:
    backgroundColor: "{colors.status-up}"
    rounded: "{rounded.full}"
    size: "12px"
  uptime-day:
    backgroundColor: "{colors.status-up}"
    rounded: "{rounded.sm}"
    height: "32px"
  status-banner-operational:
    backgroundColor: "{colors.status-up}"
    textColor: "oklch(1 0 0)"
    typography: "{typography.headline}"
    rounded: "{rounded.lg}"
    padding: "24px"
  nav-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  nav-item-rest:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
---

# Design System: Uppity

## Overview

**Creative North Star: "The Quiet Ward"**

Uppity is a monitoring instrument built on the premise that silence is the healthy state. A ward at rest is calm and almost featureless — soft light, low contrast, nothing competing for attention — and that stillness is precisely what makes a single changed reading impossible to miss. The interface holds itself back so that the one moment it does speak, it is unmistakable. Ninety-five percent of sessions are a five-second glance to confirm nothing has changed; the design optimizes for that glance costing nothing, and for the rare bad night costing nothing either.

The system is achromatic almost everywhere. Chrome, surfaces, borders, and body text carry **zero chroma** — true neutrals, not tinted grays. Color is reserved for one job: reporting the condition of a monitored thing. This is not restraint for its own sake; it is what makes a single amber dot legible at a glance on a phone at 3am. Depth comes from surface lightness rather than shadow, so the page reads as a set of quietly stacked planes instead of floating cards. Motion is slow and reactive: it acknowledges a state change and then stops.

The rejected alternative is the dense telemetry console — the wall of sparklines, gauges, and continuously ticking numbers. That aesthetic reads as vigilance, but it inflates every signal until none of them mean anything. Uppity is the opposite of a wall of lights. It is a room where nothing is happening, and where you will know instantly when that stops being true.

**Key Characteristics:**

- Achromatic chrome; saturation belongs exclusively to status
- Tonal layering for depth — surfaces lift, they do not float
- Generous line-height and unhurried density; airy, one thing at a time
- Every measured value set in monospace, without exception
- Light and dark are equal citizens on every surface, including public ones
- Alarm is rare, total, and never gradual

## Colors

A single emerald against true neutrals, plus a five-state signal family that is the only other saturation in the product.

Values below are the **light-theme** (`:root`) definitions in `src/routes/layout.css`; the frontmatter is normative for them. Every token has a `.dark` counterpart in the same file, catalogued in `.impeccable/design.json` under `extensions.colorMeta[*].dark`. Never hardcode a hue that a token already names.

### Primary

- **Vital Emerald** — the brand and the pulse, in one color. It marks the product (primary buttons, active navigation, focus rings, the org and account avatars) _and_ it marks a healthy service. Those two meanings are deliberately unified: what Uppity is and what "up" looks like are the same green. Theme-invariant — identical in light and dark, unlike every other token.
- **Emerald Breath** (`accent`) — the palest possible wash of the primary hue, at 0.052 chroma. This is the hover surface for outline and ghost buttons, dropdown items, and sidebar accents. It is the only way emerald appears as a _background_ outside of a committed action.

### Tertiary — The Signal Family

Five states plus a null. These are semantic tokens, not palette picks, and they are the entire justification for color existing in this product.

- **Vital Emerald** (`status-up`) — operational. Resolves to the same value as `primary`.
- **Ward Amber** (`status-degraded`) — responding, but slower than its degraded-response-time threshold allows. Warning without alarm.
- **Ward Ember** (`status-partial`) — a partial outage: some monitors in a group are down. Sits deliberately between amber and scarlet in hue so a partial outage reads as _closer to down than to degraded_.
- **Alarm Scarlet** (`status-down`) — down. Resolves to the same value as `destructive`, because a failed check and a destructive action carry the same weight of attention. Rare and total.
- **Ward Blue** (`status-maintenance`) — a scheduled maintenance window is active. The only cool signal, because planned downtime is categorically different from failure and must never be mistaken for it.
- **Ward Slate** (`status-unknown`) — no data, never checked, or paused. Achromatic on purpose: the absence of a reading is not a reading.

### Neutral

- **Ward Paper** (`background`, `card`, `popover`) — pure white in light, and the surface everything sits on.
- **Ward Ash** (`sidebar`, `muted`, `secondary`) — the barely-lifted plane. Carries the sidebar, muted fills, skeleton loaders, and secondary buttons.
- **Ward Night** (`foreground`, `card-foreground`) — near-black at 0.145 lightness. Primary text.
- **Ward Mist** (`muted-foreground`) — mid-gray at 0.556. Every piece of secondary text: descriptions, timestamps, table meta, placeholder copy.
- **Ward Line** (`border`, `input`) — the hairline at 0.922. In dark it becomes `oklch(1 0 0 / 10%)` — a translucent white rather than a lighter gray, so borders stay integrated with whatever surface they sit on.

### Named Rules

**The Zero-Chroma Rule.** Every neutral in this system has a chroma of exactly `0`. Not a warm gray, not a cool gray — achromatic. If a surface, border, or body-text color has chroma above zero, it is either the emerald accent wash or it is a mistake.

**The Signal Monopoly Rule.** Saturated color reports the condition of a monitored thing and nothing else. No colored section headers, no colored category tags, no decorative accent blocks, no colored illustrations. If a color on screen is not answering "what state is this in?", remove it.

**The One Green Rule.** There is exactly one green in Uppity, and it is `primary`. Tailwind's `green-500`, `emerald-400`, and every other palette green are prohibited. Reach for `status-up` or `primary`; if neither fits, the element should not be green.

**The Null Is Gray Rule.** Unknown, paused, never-checked, and no-data all render in `status-unknown`. They are never green ("probably fine"), never amber ("mildly concerning"). Missing information gets no color, because coloring it invents a claim the database cannot support.

## Typography

**Display Font:** IBM Plex Sans Variable (with `ui-sans-serif`, `system-ui`, `sans-serif`)
**Body Font:** IBM Plex Sans Variable (same stack)
**Label/Mono Font:** IBM Plex Mono (with `ui-monospace`, `SFMono-Regular`, `Menlo`, `monospace`)

**Character:** Plex is a humanist grotesque with slightly open apertures and a faintly mechanical spine — engineered but not cold, which is exactly the register a monitoring tool that runs on a schedule should speak in. Its mono companion shares the same skeleton, so a response time set in Plex Mono sits beside a label set in Plex Sans without the visual seam a mismatched pairing creates. Weights stay low: 300 for display, 400 for body, 500–600 for emphasis. Nothing is set in 700.

### Hierarchy

- **Display** (300, `clamp(2.25rem, 5vw, 3rem)`, 1.05, `-0.02em`): the landing hero and nothing else. Light weight at large size — the quietest possible way to be big.
- **Headline** (600, 24px, 1.2, `-0.01em`): page titles (`Dashboard`, `Monitors`) and the overall status banner on a public page.
- **Title** (600, 18px, 1.3): section headings and card titles. Card titles additionally set `line-height: 1` because they sit in a fixed grid row.
- **Body** (400, 14px, 1.6): the dominant size across the entire application. Line-height 1.6 is generous for 14px and is the main lever making dense operational screens feel unhurried. Cap prose at 65–75ch; incident descriptions and postmortems are the surfaces this matters on.
- **Label** (500, 12px, 1.4, `+0.01em`): badges, table headers, timestamps, monitor-type tags, and secondary meta. Uppercase only for monitor type (`HTTP`, `TCP`, `PUSH`).
- **Readout** (Plex Mono, 400, 14px, 1.4): every measured value.

### Named Rules

**The Measured-Value Rule.** If a number came from a check, a clock, or the database, it is set in mono. Uptime percentages, response times, timestamps, durations, IP addresses, monitor URLs, session IDs, audit-log record IDs. If a number was typed by a human or is a simple count ("4 monitors"), it is set in sans. Mono is what distinguishes a _reading_ from a _word_.

**The No-Bold Rule.** The heaviest weight in the system is 600. Emphasis comes from size, color, and spacing before it comes from weight. A page where three things are bold has nothing emphasized.

## Layout

**The application shell** is a fixed 256px sidebar and a scrolling content column. The sidebar is persistent from `lg` (1024px) up and becomes an off-canvas drawer below it, sliding in over a `black/50` scrim in 200ms. Below `lg`, a 56px header carries the hamburger and the current organization name. The content column is a two-row grid (`auto 1fr`) so the mobile header never scrolls and only `<main>` overflows.

**Content padding** is 16px on mobile, 24px from `sm` (640px) up. Vertical rhythm inside a page is 24px between major blocks and 16px within them — `space-y-6` wrapping `space-y-4` is the single most repeated structure in the codebase and should stay that way.

**Public and marketing surfaces** are centered in an 896px column with 16px side padding: the status page, its incident detail pages, and the landing page. Forms and settings panes use a 672px column. Authentication uses 448px, vertically centered in the viewport. These four widths are the entire container vocabulary.

**Responsive behavior has one major reflow, at `sm` (640px).** Stat grids go 2-up → 4-up, header rows go stacked → justified, secondary metadata (monitor URLs, separator dots) appears. `lg` is reserved almost exclusively for the sidebar. `md` is used three times in the whole product. Design mobile-first and treat the 640px step as the real breakpoint.

**Spacing scale in practice:** 8px binds an icon to its label, 12px binds a status dot to a monitor name, 16px separates rows and pads cards, 24px separates sections, 32px separates page regions, 64px is the marketing rhythm.

### Named Rules

**The Two-Column Rule.** Content never exceeds two columns. Stat cards go 2-up then 4-up because they are single glyphs, not columns of content. Anything with prose in it stays one column on mobile and at most two on desktop.

## Elevation & Depth

**This system has no resting shadows.** Depth is expressed entirely through surface lightness and hairline borders. `card`, `popover`, and `sidebar` sit at pure white against a `background` plane recessed to 0.985, and dark mode preserves the same relationship: `background` drops to 0.145 while `card` and `sidebar` lift to 0.205. The recessed page and the lifted card are the system's only two planes, in both themes. Nothing in the page hovers above anything else. Elements are stacked planes, not floating panels — which is why an incident banner appearing genuinely reads as an event rather than as more of the same furniture.

Shadow is reserved for elements that have genuinely left the page: dialogs, popovers, dropdown menus, sheets, tooltips. Those are the only places a shadow is correct, because they are the only places something is actually in front of the document.

### Shadow Vocabulary

- **Overlay** (`box-shadow: 0 10px 15px -3px oklch(0 0 0 / 0.1), 0 4px 6px -4px oklch(0 0 0 / 0.1)`): dialogs, sheets, dropdown menus, popovers, tooltips. The only sanctioned resting shadow, and only for elements rendered in a portal.
- **Focus ring** (`box-shadow: 0 0 0 3px oklch(0.696 0.17 162.48 / 0.5)`): not elevation, but the system's other box-shadow. A 3px emerald halo paired with a `ring`-colored border, applied on `:focus-visible` only. Uniform across buttons, inputs, textareas, selects, checkboxes, switches, and badges.

### Named Rules

**The Flat-Plane Rule.** A card, a panel, a sidebar, or a row does not carry a shadow at rest. If an element needs to feel separated, change its surface lightness or give it a border. Reach for shadow only when the element is portaled above the document.

**The Hover-Is-Tone Rule.** Hover states change background tone, never elevation. `hover:bg-muted/50` on a list row, `hover:bg-accent` on a ghost button. Nothing lifts on hover, and nothing casts a shadow it did not already have.

## Shapes

Corners are consistently soft but never pill-like, on a scale derived from a single `--radius: 0.625rem` (10px) root:

- **6px** (`sm`) — the uptime-bar day cells. Small enough that ninety of them in a row still read as a continuous band.
- **8px** (`md`) — every interactive control: buttons, inputs, textareas, selects, the org-switcher trigger.
- **10px** (`lg`) — containers that are not cards: navigation items, alert banners, the overall status banner, monitor rows, feature tiles.
- **14px** (`xl`) — `Card.Root` only. Cards are the largest radius in the system, which is what marks them as the outermost container.
- **Full** — status dots, badges, avatars, incident-timeline icon chips, progress tracks.

Borders are always exactly 1px, always `border`-token colored, and always the primary means of containment. The system uses no dividers thicker than 1px, no double borders, and no decorative rules — with one exception: the incident timeline's 2px vertical connector, which is structural rather than ornamental.

### Named Rules

**The Round-Or-Rectangular Rule.** An element is either fully round (`rounded-full`) or on the 6/8/10/14 scale. There is no intermediate "very round" state. Status dots, badges, and avatars are circles; everything else is a soft rectangle.

**The Twelve-Pixel Dot Rule.** The monitor status indicator is always a 12px circle (`h-3 w-3 rounded-full`), never an icon, never a colored text label, never a different size. It is the single most repeated element in the product and its consistency is what makes a list of forty monitors scannable in one pass.

## Components

### Buttons

- **Shape:** softly rounded (8px), 36px tall by default, with 32px (`sm`) and 40px (`lg`) alternates and square 32/36/40px icon variants.
- **Primary:** Vital Emerald fill, near-white text, 16px horizontal padding, 8px gap between icon and label. Icons are always 16px and always precede the label.
- **Hover / Focus:** primary drops to 90% opacity; outline and ghost shift their background to Emerald Breath. Focus-visible applies the 3px emerald ring plus a `ring`-colored border. Transition is `all` — but only color and border actually move.
- **Outline:** transparent-to-background fill with a 1px border; in dark mode it takes a translucent `input/30` fill instead so it does not read as a hole.
- **Ghost:** no border, no fill at rest. The default for icon-only actions — back arrows, menu toggles, row actions.
- **Destructive:** Alarm Scarlet fill with pure white text (not `foreground`), reserved for irreversible actions. In dark mode it drops to 60% opacity so it does not glare.
- **Disabled:** 50% opacity with pointer events off. Applied identically via `disabled` and `aria-disabled`, so anchor-buttons behave like real buttons.

### Badges

- **Style:** fully round, 1px border, 12px label type, 8px horizontal padding, 3px vertical. Icons inside are 12px.
- **State mapping:** `default` (emerald) for operational, `destructive` for down, `outline` for degraded, `secondary` for paused and unknown. This mapping lives in `getStatusBadge()` and should not be re-derived at call sites.

### Cards / Containers

- **Corner Style:** 14px — the largest radius in the system.
- **Background:** `card` over `background`; the tonal step is what separates them.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px `border` token.
- **Internal Padding:** 24px vertical on the root with 24px horizontal on header, content, and footer sections. Card header is a two-row grid with a 6px gap, and grows an auto right column when a card action is present.

### Inputs / Fields

- **Style:** 36px tall, 8px radius, 1px `input` border, transparent-to-background fill (`input/30` in dark). Text is 16px on mobile and 14px from `md` up — the 16px floor prevents iOS zoom-on-focus.
- **Focus:** border shifts to `ring`, plus the 3px emerald halo. Only `transition-[color,box-shadow]` animates, so the field never shifts geometry.
- **Error:** `aria-invalid` drives a scarlet border and a scarlet-tinted ring. Validation state is expressed through ARIA, not through a class — screen readers and the visual treatment stay in sync by construction.
- **Selection:** selected text inside an input inverts to emerald-on-white.

### Navigation

- **Style:** vertical list of 10px-radius rows, 12px horizontal and 8px vertical padding, 12px gap between the 20px icon and its 14px medium-weight label.
- **Active:** solid Vital Emerald fill with near-white text. Matched by exact path or path-prefix, so `/monitors/abc` keeps `Monitors` lit.
- **Rest / Hover:** `muted-foreground` text over nothing; hover fills with `muted` and promotes text to `foreground`.
- **Mobile:** off-canvas drawer at 256px, translating in over a `black/50` scrim in 200ms `ease-in-out`, dismissed by scrim click, Escape, or navigation.
- **Chrome:** the org switcher pins to the top behind a 1px divider, the account menu to the bottom behind another. Both use a 32px rounded avatar — square-ish (8px) for organizations, circular for people — and a chevron that rotates 180° over 200ms when open.

### The Uptime Bar

The signature component: ninety day-cells in a row, each `flex-1` with a 6px radius and a 2px gap, 32px tall, colored by that day's aggregate state. Hovering a cell lightens it one step and surfaces a native tooltip with the date and that day's uptime percentage. It is anchored by two 12px `muted-foreground` captions — "90 days ago" on the left, "Today" on the right — and it is the one place in the product where a hundred data points are shown at once. It works because every cell is the same size and only its color varies.

### The Status Banner

The full-width overall-state block at the top of a public status page: 10px radius, 24px padding, a solid fill of the current state color, a 32px icon, and a 24px semibold label in white. It is the only element in the entire system that fills a large area with saturated color, and that is precisely why it works — nothing else competes with it, so its color _is_ the message. It has six states, one per signal token plus unknown.

### The Incident Timeline

A vertical sequence of updates, each led by a 32px circular chip tinted with its status color and holding a 16px icon, connected by a 2px vertical line in `border`. Each entry pairs a rounded status pill with a monospaced timestamp and a 14px body message. Truncates to three entries in list contexts with a "+N more updates" affordance.

### Empty States

Centered column with a 48px icon at 50% `muted-foreground` opacity, an 18px semibold title, a 14px muted description, and a single primary action. Renders inside a card by default and bare when nested in one. When the action is blocked by a plan limit, the button goes disabled and a tooltip carries the reason — the limit is explained, never silently enforced.

## Do's and Don'ts

### Do:

- **Do** reach for a semantic token first: `bg-card`, `text-muted-foreground`, `border-border`. Every color in this product has a name, and using the name is what makes dark mode work for free.
- **Do** set every measured value in mono — uptime, latency, timestamps, durations, IPs, URLs, IDs. The Measured-Value Rule is the single most load-bearing typographic decision in the system.
- **Do** render monitor status as a 12px circle plus a text label. Color alone never carries state; roughly 8% of the operators reading a down-alert at 3am cannot distinguish your amber from your emerald.
- **Do** verify every new surface in both themes before considering it finished. Light and dark are equal citizens; `mode-watcher` is wired and the token layer is fully doubled.
- **Do** route all user-facing copy through Paraglide `m.*` messages across `en`, `de`, and `pt-br`, and design for German — it runs roughly 30% longer than English and is where fixed-width labels break.
- **Do** express depth as a change in surface tone. `hover:bg-muted/50`, `bg-card` over `bg-background`, `bg-sidebar` beside both.
- **Do** extend `src/lib/components/ui/` and the shadcn-svelte registry rather than introducing a parallel component vocabulary.
- **Do** design the empty and unknown states deliberately. A monitor that has never been checked is a real, common state, and it is gray.

### Don't:

- **Don't** hardcode a hex, an `rgb()`, or a Tailwind palette literal. `bg-gray-50`, `bg-white`, `text-gray-900`, and `bg-green-500` are all prohibited. The unit specs for `status.ts` and `incidents.ts` fail on any palette literal escaping those helpers; keep it that way.
- **Don't** introduce a second green. There is one, it is `primary`, and every other green in the codebase is legacy.
- **Don't** put a shadow on anything that has not left the page. Cards, rows, panels, and sidebars are flat at rest.
- **Don't** use saturated color for anything that is not reporting the state of a monitored thing. No colored headings, no decorative accents, no category tints.
- **Don't** exceed font-weight 600. If something needs more emphasis than 600 gives it, the problem is hierarchy, not weight.
- **Don't** hardcode a value that `.env` owns. Check intervals, retention days, degraded-response thresholds, and SSL warning windows are all `UPPITY_*` configurable and must be read, not assumed.
- **Don't** let plan-limit or billing UI become load-bearing. It vanishes entirely under `SELF_HOSTED=true`, and the layout must not notice.
- **Don't** invent social proof. There are no customers, testimonials, logos, uptime figures, or review scores. Any surface that appears to need them must be designed to work without them.
- **Don't** animate for decoration. Motion acknowledges a state change — a 200ms color shift, a drawer sliding, a spinner while a check is in flight — and then stops.
