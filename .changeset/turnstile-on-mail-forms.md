---
"uppity": minor
---

The register, password reset and status page subscribe forms can now run a Cloudflare Turnstile bot check. It is usually invisible to visitors, and status page visitors only load it once they start on the subscribe form.

Self-hosted instances keep working with no setup. To turn it on, create a Turnstile widget for the host in `BETTER_AUTH_URL` and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` on the web server. Setting only one makes those forms refuse submissions and logs an error.

With the check on, the subscribe form needs JavaScript. Those forms also refuse submissions while Cloudflare is unreachable, and unsetting both keys reopens them. Reading a status page and signing in never depend on Cloudflare. Cloudflare receives the IP address and browser details of visitors who use the forms, so name it in your privacy notice.
