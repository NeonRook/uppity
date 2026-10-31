---
"uppity": patch
---

Self-hosted operators can now be told when monitors stop being checked on their instance. Set `UPPITY_OPS_ALERT_EMAIL`, `UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL`, or both on the notifier worker to get an alert when checks are overdue, when monitors are dead-lettered, or when the database cannot be read. The same alert repeats every 6 hours while its cause lasts; change that with `UPPITY_OPS_ALERT_COOLDOWN_HOURS`. Email needs the SMTP settings, and a webhook on a private address needs `UPPITY_ALLOW_PRIVATE_TARGETS`. With neither destination set, nothing changes. The upgrade adds one small table and locks nothing that exists.
