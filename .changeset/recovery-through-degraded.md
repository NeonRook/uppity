---
"uppity": patch
---

A monitor that recovers through a slow patch now sends its recovery alert. Before, going from down to degraded to up sent no recovery alert and left the automatic incident open on the status page until the next outage ended.

The recovery alert goes out on the first up check. The automatic incident closes then too, or sooner if the monitor stays degraded for 5 minutes, because it is responding again.
