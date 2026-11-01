---
"uppity": minor
---

Hosted instances now limit email to addresses that never agreed to mail: channel confirmations, status page subscriber confirmations and team invitations. The whole instance sends at most 1,000 a day, of which status page subscriptions may use half, and past that sends are refused with a message saying so. An organization whose own channel confirmations and invitations draw too many hard bounces or spam complaints can't email new addresses until an admin clears it from the organization's page in the admin area. Addresses visitors type into a status page don't count against its organization. Alerts to confirmed addresses are never held back.

Self-hosted instances keep working as before: the ceiling is off with `SELF_HOSTED=true`, and organizations are only blocked if a Resend webhook is set up. Set `UPPITY_UNSOLICITED_MAIL_DAILY_CEILING` to change or turn on the ceiling, and the `UPPITY_MAIL_*` variables in `.env.example` to change the thresholds. To hear about the ceiling and blocks, set `UPPITY_OPS_ALERT_EMAIL` or `UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL` on the web server as well as the notifier.

With `docker-compose.yml`, `SELF_HOSTED` from your `.env` now reaches every container. It was ignored before, so if you set it, plan limits stop applying after this upgrade.

Subscription confirmation links no longer contain the status page's address. Links already sent keep working. The upgrade only adds new tables.
