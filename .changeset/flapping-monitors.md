---
"uppity": patch
---

A monitor that keeps going down and recovering no longer sends an alert for every change. After 5 up and down alerts in an hour, its next outage sends one "flapping" message instead, with a reminder every hour while it lasts. Up, down and degraded alerts then wait until the monitor stays down for 5 minutes or goes 5 minutes without going down, and you get one alert for its status.

A real outage is still reported: a flapping monitor that stays down alerts within 5 minutes plus one check interval of its first failure, or at its "alert after failures" setting if that takes longer. A flapping monitor that recovers sends one recovery alert after the same 5 minutes. A monitor that keeps switching between down and degraded stays on hold, with the hourly reminder and an open incident, until it does one or the other.

The monitor page explains when a monitor is flapping. Status, check history, uptime and public status pages stay live throughout. An automatic incident stays open with the title "<monitor> is flapping" until the monitor settles, instead of one incident per bounce.

Webhooks get a new `monitor_flapping` event type. Webhook consumers that act on `monitor_down` and `monitor_up` receive neither while a monitor flaps.

Self-hosted operators can change this on the monitor worker with `UPPITY_FLAP_THRESHOLD`, `UPPITY_FLAP_WINDOW_SECONDS` and `UPPITY_FLAP_SETTLE_SECONDS`. A threshold below 2 turns it off. A longer settle time delays the alert for an outage that follows flapping.
