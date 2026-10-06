---
"uppity": patch
---

Fixes a security issue: any signed-in account could use the admin area's forms, including changing another user's email address, editing organizations and their members, and resyncing subscriptions. These now require an admin account. Operators should review the audit log for admin changes made by accounts that are not admins.
