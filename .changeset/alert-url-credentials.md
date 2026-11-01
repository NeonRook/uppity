---
"uppity": patch
---

Monitor alerts no longer show passwords or tokens from a monitor's URL. Slack, Discord, email and webhooks now get the URL without its username, password and fragment, with query values shown as `***`, and a URL that is not a valid web address appears as a fixed message. Webhooks keep the `monitor.url` field and the `{{monitor.url}}` template variable with the same masked value, so a consumer that calls or matches that URL should use `monitor.id` instead. The API masks query parameters that have no value and returns `null` for a monitor URL that is not http or https. A check that fails on an unsupported redirect no longer quotes the redirect target in alerts or incident updates. Alerts sent before this release still hold the original URL, so change any credential you had in a monitor URL.
