---
"uppity": minor
---

Monitors report more, and push monitors recover properly.

- A push monitor that comes back after an outage now sends its "up" notification and resolves the incident that was opened for it. Heartbeats received during a maintenance window no longer change the monitor's status.
- Each HTTP check now shows how long DNS, connecting, TLS and the first byte took, and how many redirects it followed.
- HTTP monitors have two new settings: "Follow redirects" (on by default; off reports the redirect itself, such as a 301) and "Accept self-signed certificate" (off by default; on still checks the host name and expiry).
- Failed checks say what failed, such as the DNS lookup, a refused connection, an expired or untrusted certificate, or a timeout and the step it happened in, instead of "fetch failed". Failed Slack, Discord and webhook notifications say the same.
- "Response body contains" accepts up to 1024 characters and matches within the first 1 MiB of the response.
