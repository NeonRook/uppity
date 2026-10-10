---
"uppity": patch
---

Email notification channels now deliver. Before, the notifier never received the SMTP settings, so alerts to an email channel were dropped while password reset mail still worked. Self-hosters using the published `docker-compose.yml` get the fix by pulling the new file. The notifier now reads the same `SMTP_*` variables as the app. If you run the notifier some other way, pass those variables to it too.

The default sender address, used when neither `SMTP_FROM` nor `UPPITY_EMAIL_FROM` is set, is now `noreply@uppity.cloud`. Set `SMTP_FROM` to an address on a domain you control, or your mail will fail SPF and DKIM checks.
