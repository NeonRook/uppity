---
"uppity": minor
---

Read your monitors, their check history, and your incidents over a REST API. Create keys under Settings → API keys; owners and admins manage them, and every plan can read. Each key can make 60 requests on Free or 600 on paid plans before it has to pause, and the count resets once the key has gone a full minute without an accepted request. The reference is at `/api/openapi.json`.

Self-hosted operators set the per-key figure with `UPPITY_API_REQUESTS_PER_MINUTE` (default 600). Upgrading adds one database table for API keys.
