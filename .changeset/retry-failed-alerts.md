---
"uppity": minor
---

Alerts that fail to deliver are now sent again instead of being lost. When a mail server, Slack, Discord or a webhook is down, times out or is overloaded, Uppity tries again after 1, 2, 5, 10, 20 and 30 minutes, and a late alert shows the time it happened. Status page subscribers get the same retries. A clear refusal, such as a rejected address or a webhook answering 404, is not tried again. After a timeout, an alert can occasionally arrive twice.

A webhook that takes longer than 30 seconds to answer now counts as failed and is retried.

An email channel whose address bounced or marked email as spam now says so on the notification channels page, because alerts to it are dropped.

Self-hosted operators with ops alerts configured get one message when alerts run out of retries, at most once per cooldown. Nothing to configure and no migration.
