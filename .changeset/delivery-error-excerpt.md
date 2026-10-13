---
"uppity": patch
---

When a webhook, Slack or Discord endpoint rejects an alert, the recorded error keeps the status code and the first 512 bytes of the response instead of the whole response.
