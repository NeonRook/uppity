---
"uppity": minor
---

On the hosted service, staff now turn on status page email subscriptions per organization, from its page in the admin area. Organizations with confirmed subscribers are turned on by the upgrade and keep emailing them. All others stop showing the subscribe form until staff turn it on, and confirmation links already sent to their visitors stop working. Alerts are not affected.

Self-hosted instances have no such switch, provided `SELF_HOSTED=true` is set on both the web server and the notifier. Without it, an instance follows the hosted rule, so set it before upgrading, or turn subscriptions on for each organization in the admin area. With `docker-compose.yml`, setting it in your `.env` covers every container. The upgrade adds one column and updates organizations with confirmed subscribers.
