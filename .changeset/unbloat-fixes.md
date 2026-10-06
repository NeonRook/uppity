---
"uppity": patch
---

HTTP monitors can use the OPTIONS method, which the method picker offered but saving rejected.

The HTTP check timeout now also covers reading the response body. A monitor that checks the body for expected text now reports down when the body takes longer than its timeout to arrive, where before the check could wait indefinitely.

Alert messages read the same across Discord, Slack and email, and every channel now shows when the event happened. Long titles and values are shortened to fit Slack's and Discord's limits instead of failing to send. The notification worker lets sends in progress finish before shutting down, so a redeploy no longer risks sending the same alert twice.

Confirmation and error messages in the app now appear; they were silently dropped before. Monitor uptime shows two decimals and is rounded down, so any downtime keeps it below 100%. Incident update times on public status pages show correctly for viewers outside UTC.

In the admin area, user pages load for every user, not only the first thousand, and role and plan selections are submitted once. Organization slugs created from settings drop punctuation instead of turning it into hyphens, as slugs elsewhere already did.

Two unused endpoints are removed: the monitor dead-letter reset JSON endpoint and the monitor live-updates stream. Nothing in Uppity called either.

Upgrading runs a migration that drops an unused table. The `UPPITY_DEFAULT_LIST_LIMIT`, `UPPITY_QUEUE_POLL_INTERVAL_MS` and `UPPITY_WORKER_POLL_INTERVAL_MS` variables were never read and are no longer documented; it is safe to remove them.
