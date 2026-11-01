---
"uppity": minor
---

Alerts that fail to deliver are now sent again instead of being lost. When a mail server, Slack, Discord or a webhook is down, times out or is overloaded, Uppity tries again after 1, 2, 5, 10, 20 and 30 minutes. Status page subscribers get the same retries. A clear refusal, such as a rejected address or a webhook answering 404, is not tried again. After a timeout, an alert can occasionally arrive twice.

A late alert says it is late and shows the time it happened. If the monitor or incident has moved on since, its subject says so, for example "Delayed, now up", and webhooks do not receive it, so an automation never ends on an old state.

A webhook that takes longer than 30 seconds to answer now counts as failed and is retried.

An email channel whose address bounced or marked email as spam now says so on the notification channels page, because alerts to it are dropped.

Self-hosted operators with ops alerts configured get a message within minutes when the mail server refuses the login or the sender, or stops answering, at most once per cooldown. Alert emails wait for about an hour, so fixing the password in that time delivers them. An ops alert sent by email goes through that same mail server, so set the Discord destination to hear about this. A customer's failing webhook sends no ops alert. Nothing to configure and no migration.
