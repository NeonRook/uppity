---
"uppity": patch
---

Fixes a security issue in the admin area. Any signed-in account could read its data, including every user's email address, the organization list and the audit log. It could also use the admin forms, including changing another user's email address, editing organizations and their members, and resyncing subscriptions. The admin area now requires an admin account for every request. Operators should review the audit log for admin changes made by accounts that are not admins.
