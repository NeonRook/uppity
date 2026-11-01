---
"uppity": minor
---

Status pages can now serve on your own domain, such as `status.example.com`. Add the domain in the page's settings, create the CNAME and TXT records it shows, and the page goes live on that domain once DNS checks out. Keep both records in place: about three hours after either one is removed, the page leaves the domain. On hosted plans that include custom domains, HTTPS for a new domain is set up by hand, so it may take a while after the domain shows as active.

Self-hosted operators need to do three things to use this. Pass the original `Host` header through your reverse proxy, get a certificate for each customer domain, and add each domain to your Turnstile widget if you use one. The custom domains guide in the repository has Caddy and Traefik examples. `UPPITY_STATUS_PAGE_CNAME_TARGET` sets where customers point their domain.

Upgrade note: a request for a public hostname that is not in `BETTER_AUTH_URL`, `ORIGIN` or `BETTER_AUTH_TRUSTED_ORIGINS`, and is not a verified domain, now gets a 404 instead of the app. If you reach the app under a second name, add it to `BETTER_AUTH_TRUSTED_ORIGINS` before upgrading. IP addresses and internal names keep working. Any domain stored on a status page by hand now needs verifying before it serves.
