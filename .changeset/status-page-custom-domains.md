---
"uppity": minor
---

Status pages can now serve on your own domain, such as `status.example.com`. An owner or admin adds the domain in the page's settings, creates the CNAME and TXT records it shows, and the page goes live on that domain once DNS checks out. Keep both records in place: about three hours after either one is removed, the page leaves the domain, and owners and admins get an email and see the domain marked as lost in the settings. Putting the records back restores it. On hosted plans that include custom domains, HTTPS for a new domain is set up by hand, so it may take a while after the domain shows as active.

Self-hosted operators need to do three things to use this. Pass the original `Host` header through your reverse proxy, get a certificate for each customer domain, and add each domain to your Turnstile widget if you use one. The custom domains guide in the repository has Caddy and Traefik examples. `UPPITY_STATUS_PAGE_CNAME_TARGET` sets where customers point their domain. With `SELF_HOSTED=true` it defaults to the host of `BETTER_AUTH_URL`, and without a public hostname there the feature stays hidden.

Upgrade note: any domain already stored on a status page by hand was never verified, so it stops being used as the page's address. The page's settings show it as waiting for DNS until an owner or admin creates the records. Other hostnames keep reaching the app as before.
