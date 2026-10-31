---
"uppity": patch
---

Status page subscribers whose address hard-bounces or reports an email as spam stop receiving mail, and no later confirmation email reaches them if they subscribe again. Their subscriptions are deleted after 90 days (`UPPITY_SUPPRESSED_SUBSCRIBER_RETENTION_DAYS`).

If you send through Resend, add a webhook for `email.bounced` and `email.complained` pointing at `/api/webhooks/resend`, and set its signing secret as `RESEND_WEBHOOK_SECRET` on the web server. Without the secret the endpoint refuses every request and mail behaves as before.
