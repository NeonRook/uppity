---
"uppity": minor
---

Self-hosted: checks and notifications no longer reach private addresses by default.

- HTTP and TCP checks, and Slack, Discord and webhook notifications, now refuse hosts on private, loopback, link-local and similar internal addresses, including your cloud provider's metadata service. A monitor pointed at one fails with "Blocked: … private address". If your instance monitors services on its own network, set `UPPITY_ALLOW_PRIVATE_TARGETS=true` on the monitor and notifier workers. Leave it unset where people you do not trust can create monitors.
- To trust a private certificate authority in checks, set `NODE_EXTRA_CA_CERTS` to the path of its PEM file inside the container.
- `UPPITY_SSL_INFO_TIMEOUT_MS` is gone. Certificates are now read during the check itself, within the monitor's timeout.
- The upgrade's migration reads the check history once to build an index. Saving new check results waits until it finishes.
