---
"uppity": minor
---

Visitors can subscribe to a public status page by email. They confirm through a link that works for 48 hours, and every email they receive lets them unsubscribe. Addresses that are never confirmed are deleted.

Each status page sends a limited number of confirmation emails a day, so nobody can use the form to flood strangers' inboxes. The limit is 50, or a quarter of the page's confirmed subscribers when that is more, up to 300. Self-hosted operators can change these with `UPPITY_SUBSCRIBER_CONFIRMATIONS_BASE`, `UPPITY_SUBSCRIBER_CONFIRMATIONS_PERCENT` and `UPPITY_SUBSCRIBER_CONFIRMATIONS_MAX`.
