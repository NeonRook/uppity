---
"uppity": patch
---

Monitor alerts no longer show passwords or tokens from a monitor's URL. Slack, Discord, email and webhooks get the URL without its username, password and fragment, with query values and unusual query names shown as `***`. A secret written in the URL's host or path is still shown, so move it to a request header. A stored URL that is not http or https is left out of alerts, and webhooks send `monitor.url` as `null` for it. Because webhooks now get the masked value, a consumer that calls or matches that URL should use `monitor.id` instead.

The API applies the same masking and returns `null` for a monitor URL that is not http or https.

An automatically opened incident now starts with "Monitor is not responding." instead of the check's error text, which could show hostnames and ports on public status pages and in subscriber emails. The error stays in alerts and check history. A check that fails on an unsupported redirect no longer quotes the redirect target.

The monitor form now requires an http or https URL. A monitor saved with any other URL fails every check, and its form asks for a working URL before the next save.

Alerts and incident updates already sent still hold the original text, so change any credential you had in a monitor URL.
