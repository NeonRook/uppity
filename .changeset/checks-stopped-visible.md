---
"uppity": patch
---

When Uppity stops running checks altogether, monitors now show "Not checked" in the app and on public status pages within five minutes, instead of their last status. Before, a stopped checker left every status page showing the last result as current.

Self-hosted operators: the notification worker logs `monitor_checks_overdue` every five minutes while any monitor goes unchecked. Point a log alert at it.
