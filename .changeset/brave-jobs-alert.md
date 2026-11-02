---
"uppity": minor
---

Operator alerts now also tell you when a maintenance job fails, such as the daily uptime stats or scheduled maintenance windows starting and ending. To receive them, set `UPPITY_OPS_ALERT_EMAIL` or `UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL` on the monitor worker too, not only on the notifier. A job that keeps failing alerts again after `UPPITY_OPS_ALERT_COOLDOWN_HOURS`.
