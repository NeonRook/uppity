---
"uppity": patch
---

Derive the Uppity monitor ceiling from purchased capacity blocks (NEO-33). The pricing table has always sold "+50 monitors per $8 block", but `PlanLimits.monitors` was a hardcoded 50 and no code anywhere knew what a block was — the first of the truth gaps in the 2026-08-10 assessment.

`subscription` gains a `blocks` column, and `getEffectiveLimits` now resolves the ceiling as `50 + 50 × blocks`. Because every limit check already reads through that one method, monitor creation caps, the usage panel and the admin billing view pick up the derived figure without changes of their own.

Blocks extend Uppity and nothing else. Free has no billing relationship, and Dedicated's 2,000 is a fair-use figure on isolated infrastructure rather than a metered allowance, so blocks stored against either are inert rather than an error — a plan change must not require a cleanup pass over the column. Self-hosted still short-circuits to unlimited before any of this runs, and an unlimited ceiling is left alone rather than being turned into 49 by arithmetic on the `-1` sentinel.

Polar wiring and the billing UI that spends these blocks are separate issues; nothing writes a non-zero value yet.
