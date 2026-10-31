---
"uppity": patch
---

Team invitations now reach the person you invite. They get an email with a link to accept or decline, and anyone with a pending invitation sees it on their dashboard. Accepting needs a verified email address that matches the invitation, and only members with a verified address can invite.

Self-hosted operators: invitations need SMTP. Without it, inviting now fails with a clear message instead of reporting success. Invitation emails go through the subscriber mail server when one is set, and count toward `UPPITY_CHANNEL_PENDING_CONFIRMATIONS` together with alert confirmations.
