---
"uppity": minor
---

Status page subscribers whose address hard-bounces or reports an email as spam stop receiving mail, and no later confirmation email reaches them if they subscribe again. Their subscriptions are deleted after 90 days (`UPPITY_SUPPRESSED_SUBSCRIBER_RETENTION_DAYS`, set on the monitor worker). An admin can look up an address under Suppressed addresses in the admin area and lift it, which also keeps its subscriptions.

If you send through Resend, add a webhook for `email.bounced` and `email.complained` pointing at `/api/webhooks/resend`, and set its signing secret as `RESEND_WEBHOOK_SECRET` on the web server. Without the secret the endpoint refuses every request and mail behaves as before. Resend sends a webhook every event on the account, so instances sharing one Resend account suppress each other's addresses.
