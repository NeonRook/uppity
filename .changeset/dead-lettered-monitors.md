---
"uppity": minor
---

Security: any signed-in user could submit several of the admin area's forms. That allowed changing any user's name or email address, which is enough to take over an account through a password reset, and creating, editing or deleting organizations and their memberships, including joining any organization as its owner. Every admin form now requires an admin. The audit log records who made each admin change, so an entry whose actor is not an admin shows where this was used.

A monitor that Uppity itself repeatedly fails to check no longer goes quiet. Before, three failed attempts stopped its checks for 24 hours while the dashboard and the public status page kept showing its last status. It now keeps retrying every few minutes. Until a check succeeds, the dashboard and monitor pages show it as "Not checked" with the time of the next attempt, and the public status page shows it with no status and replaces "All systems operational" with "Some systems are not being monitored right now". The monitor's notification channels hear when checks stop and again when they resume. Webhooks receive these as `monitor_checks_stopped` and `monitor_checks_resumed`.

For operators, the admin area lists these monitors across organizations and can retry one immediately. Each one also logs an error with `event_type` set to `monitor_dead_lettered`, which a log alert can match. `UPPITY_DEAD_LETTER_HOURS` is no longer read and can be removed; `UPPITY_CHECK_BACKOFF_MAX_MS` (5 minutes by default) now sets how often these monitors retry. Upgrading runs a quick migration, and monitors currently held back by the old 24-hour rule are checked right away.
