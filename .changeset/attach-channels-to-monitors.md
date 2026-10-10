---
"uppity": minor
---

Monitors can now alert your notification channels. Until now there was no way to attach a channel, so no alerts were sent.

- New monitors start with every enabled channel attached. On the monitor form you can detach channels and choose which events each one hears: down, recovered, degraded, and certificate expiry for HTTP monitors with the SSL check on.
- A monitor's page lists where its alerts go, and warns when nobody will hear it go down.
- A channel's page lists the monitors that alert it, so you can attach or detach many at once.
