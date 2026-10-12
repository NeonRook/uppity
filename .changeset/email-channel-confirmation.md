---
"uppity": minor
---

Email alert channels now ask the recipient before sending alerts. An address that isn't a verified member of your organization gets a confirmation link and receives no alerts until it is confirmed. The channel list shows which addresses are still unconfirmed and can resend the link. Every alert email now has an unsubscribe link. When an address unsubscribes, your organization's owners and admins get an email, and you can ask that address to confirm once more.

Confirmation emails, including those for status page subscriptions, no longer contain the organization or status page name. The confirmation page shows it instead.

Existing email channels keep receiving alerts with no action needed. Self-hosted: confirmation emails go through the subscriber mail server when one is configured, and `UPPITY_CHANNEL_PENDING_CONFIRMATIONS` (default 5) sets how many addresses one organization may leave unconfirmed within a week.
