---
"uppity": patch
---

Email notification channels now deliver. Self-hosters on the published `docker-compose.yml` should pull the new file; if you run the notifier another way, give it the same `SMTP_*` variables as the app.

Uppity now refuses to send SMTP credentials over a connection without TLS. Set `SMTP_FROM` to an address on your own domain; the fallback sender is now `noreply@uppity.cloud`.
