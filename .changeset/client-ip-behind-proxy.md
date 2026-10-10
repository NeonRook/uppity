---
"uppity": patch
---

Sign-in, sign-up and password reset rate limits now apply per client behind a reverse proxy. Before, every visitor shared one limit, so a single person could lock everyone out. The audit log now records the visitor's address instead of the proxy's.

Self-hosted behind a proxy? Set `CLIENT_IP_HEADER` to the header your proxy overwrites with the client address, such as `x-real-ip`. Only set it if the proxy replaces the header on every request; otherwise visitors can choose their own address.
