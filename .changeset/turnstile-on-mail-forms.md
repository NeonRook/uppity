---
"uppity": minor
---

The register form and the status page subscribe form can now run a Cloudflare Turnstile bot check. It is usually invisible to visitors, and status page visitors only load it once they start on the subscribe form.

Self-hosted instances keep working with no setup. To turn it on, create a Turnstile widget for the host in `BETTER_AUTH_URL` and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` on the web server. Setting only one leaves the check off and logs an error. With the check on, the subscribe form needs JavaScript, and both forms refuse submissions while Cloudflare is unreachable. Status pages stay readable.
