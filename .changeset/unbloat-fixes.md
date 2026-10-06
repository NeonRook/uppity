---
"uppity": patch
---

Public status pages now show correct uptime for monitors with more than one day of history. An incident linked to several monitors on the same page no longer lists each update more than once.

HTTP monitors can use the OPTIONS method, which the method picker offered but saving rejected.

Alert messages read the same across Discord, Slack and email, and every channel now shows when the event happened.

In the admin area, user pages load for every user, not only the first thousand, and role and plan selections are submitted once.

Upgrading runs a migration that drops an unused table. The `UPPITY_DEFAULT_LIST_LIMIT`, `UPPITY_QUEUE_POLL_INTERVAL_MS` and `UPPITY_WORKER_POLL_INTERVAL_MS` variables were never read and are no longer documented; it is safe to remove them.
