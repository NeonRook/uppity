---
"uppity": patch
---

Background upkeep keeps running on busy instances. Under steady monitor load it could stop indefinitely: maintenance windows did not open or close, uptime figures went stale, old checks were not cleaned up, and stuck monitors were not released back to checking.

A background task that fails now retries within 15 minutes instead of on every pass, and a failed usage report to billing is logged as a failure rather than a success.
