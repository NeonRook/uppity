---
"uppity": minor
---

Self-hosted instances can now send traces, warnings and errors to any OpenTelemetry backend by setting `OTEL_EXPORTER_OTLP_ENDPOINT` on the web server and both workers. Nothing is sent unless you set it. Log exports leave out email addresses, IP addresses and customer text, but trace error details can include error messages.

The notifier now logs a heartbeat every five minutes, so your backend can alert you if it stops. Keep `LOG_LEVEL` at `info` or lower for this to work.

The Docker image now includes its production dependencies and is about 215 MB larger.
