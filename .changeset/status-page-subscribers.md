---
"uppity": minor
---

Visitors can subscribe to a public status page by email. They confirm through a link that works for 48 hours, and every email they receive lets them unsubscribe. Addresses that are never confirmed are deleted.

Each status page sends at most 200 confirmation emails a day, so nobody can use the form to flood strangers' inboxes. Self-hosted operators can change the limit with `UPPITY_SUBSCRIBER_CONFIRMATIONS_PER_DAY`.
