# Domain docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **single-context** repo. Four documents carry the domain, with different owners and different jobs. Read the ones relevant to your task before exploring; do not read all four by reflex.

## The four documents

### `PRODUCT.md` — product truth. Read it first.

Owned by `/impeccable`, marked with `<!-- impeccable:product-schema 1 -->`. It records what the product does, who it serves, what has been confirmed and on what date, and what has deliberately not been decided.

Three sections are **hard constraints on output**, not background reading:

- **"Explicitly undecided — do not invent"** lists open decisions. Do not resolve one in a ticket, a spec, or a component. Accessibility target level is on this list.
- **"Absences that must not be fabricated"** lists what does not exist: no customers, testimonials, logos, uptime figures, or review scores. Any surface that appears to need them must work without them.
- **"Outstanding implementation work"** marks things that are half-shipped. The `+50 per block` pricing row is derived in code but has no purchase path, so it must not appear on a public surface. A skill that reads the pricing table without reading the caveat above it will publish something a customer cannot buy.

### `DESIGN.md` — visual and interaction truth.

Also owned by `/impeccable`, derived from the shipped artifact rather than from intentions. Its YAML frontmatter is **normative** for tokens; `.impeccable/design.json` is the machine-readable sidecar and holds the dark-theme values under `extensions.colorMeta[*].dark`.

Its **Named Rules** are decision records: each states a rule, its rationale, and the failure it prevents. Treat them exactly as you would treat an ADR. Do not restate one as an ADR.

### `CONTEXT.md` — code-level glossary. Does not exist yet.

Reserved for vocabulary that `PRODUCT.md` does not reach: the terms as they appear in the schema and the service layer, and the places where an implementation word diverges from a product word. If a term is already defined in `PRODUCT.md` or `DESIGN.md`, it does not belong here.

### `docs/adr/` — engineering decisions. Does not exist yet.

Reserved for decisions with neither a product face nor a visual one: process topology, storage choices, library selection, scheduling strategy. If a decision is visible to an operator or a customer it belongs in `PRODUCT.md`; if it is visible on screen it belongs in `DESIGN.md`.

If a file does not exist, **proceed silently**. Do not flag its absence and do not propose creating it upfront. `/domain-modeling` creates `CONTEXT.md` and ADRs lazily, when a term or a decision actually gets resolved.

## Write boundaries

`PRODUCT.md` and `DESIGN.md` are **read-only to every skill except `/impeccable`**. Their structure is a parsed schema, not prose formatting: the product-schema marker, the design frontmatter, and the `.impeccable/` sidecar all depend on it. Reformatting a heading or tidying a table can break the skill that maintains them.

- A new product fact goes through `/impeccable`, not through a hand edit.
- A new design decision goes through `/impeccable`, which derives it from what shipped.
- A new implementation term goes in `CONTEXT.md`.
- A new engineering decision goes in `docs/adr/`.

## Precedence when documents disagree

1. **`PRODUCT.md` wins on product claims.** What exists, what is confirmed, what may be said out loud.
2. **`DESIGN.md` wins on anything visual or interactive.** It is derived from the shipped artifact, so it describes reality.
3. **An ADR may not contradict either.** If one needs to, that is a conversation, not a commit.

## Use the established vocabulary

When your output names a domain concept, in an issue title, a refactor proposal, a hypothesis, or a test name, use the word these documents already use. Uppity has settled terms for its core nouns: monitor, check, incident, maintenance window, notification channel, status page, capacity block. The status vocabulary is `up`, `down`, `degraded`, `unknown`, and the incident lifecycle is `investigating` → `identified` → `monitoring` → `resolved`. Design work has its own settled names: the Signal Family, the uptime bar, the status banner, Vital Emerald.

If the concept you need is not in any of them, that is a signal. Either you are inventing language the project does not use, in which case reconsider, or there is a real gap worth noting for `/domain-modeling`.

## Flag conflicts

If your output contradicts a Named Rule, a confirmed product decision, or an ADR, surface it rather than silently overriding it:

> _Contradicts the Signal Monopoly Rule in DESIGN.md, but worth reopening because…_
