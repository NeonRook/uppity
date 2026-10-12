---
"uppity": minor
---

Monitor pages now chart daily response time, average and 95th percentile, over the last 30, 60 or 90 days. Days with degraded or failed checks are shaded. The longer ranges appear only on plans that keep check history that long.

HTTP checks now open a new connection every time, as a first-time visitor would, so response times can read somewhat higher than before the upgrade.

Self-hosted: the upgrade migration fills in the 95th percentile and degraded counts for past days from the check history you still keep, which reads that history once. Days older than that show no 95th percentile and no degraded shading.
