---
"uppity": patch
---

A slow or unreachable endpoint no longer delays checks on other monitors. Each check now frees its slot the moment it finishes, so a check that waits out its full timeout holds back only itself, not the rest of the batch.

Self-hosted: `UPPITY_WORKER_BATCH_SIZE` now sets how many checks one monitor worker runs at once. The default stays at 10.
