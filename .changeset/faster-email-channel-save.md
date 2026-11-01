---
"uppity": patch
---

Saving an email channel no longer waits for the confirmation email to send. The notification worker sends it now, so self-hosted operators need that worker running for confirmation emails to go out, as they already do for alerts. "Resend confirmation" and "Ask again" still send right away.
