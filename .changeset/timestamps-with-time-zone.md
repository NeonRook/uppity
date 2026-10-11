---
"uppity": patch
---

Self-hosted instances whose PostgreSQL server runs in a timezone other than UTC recorded some times shifted by that offset. Incident update times and audit log entries showed the wrong time, checks during maintenance could count against uptime, and a new push monitor could report a missing heartbeat hours early or late. Separately, when the app itself ran outside UTC, the oldest day of a status page's uptime history could count only part of that day. Neither timezone matters any more. Times recorded before the upgrade keep their offset.

The upgrade migration locks the check history while it rebuilds its indexes, about one second per million stored checks. Checks wait for it to finish.
