---
"uppity": patch
---

Self-hosted operators can send status page subscriber mail through a separate SMTP account with `SUBSCRIBER_SMTP_HOST`, `SUBSCRIBER_SMTP_PORT`, `SUBSCRIBER_SMTP_USER`, `SUBSCRIBER_SMTP_PASSWORD` and `SUBSCRIBER_SMTP_FROM`. Anyone can enter a subscriber address, so bounces from those addresses can get a sending account suspended. A separate account keeps that from stopping your alerts. Leave these unset and subscriber mail goes through your existing SMTP settings, so you don't need to change anything when you upgrade.
