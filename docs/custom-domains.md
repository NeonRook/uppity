# Custom domains

A status page can serve on a domain such as `status.example.com`. The page's owner adds the domain
under the page's settings, and only owners and admins of the organization can add, check or remove
one. This document covers what the operator of an instance has to do.

## What the customer sets up

Two DNS records, which the settings page shows with their values:

| Type  | Name                                   | Value                        |
| ----- | -------------------------------------- | ---------------------------- |
| CNAME | `status.example.com`                   | The instance's domain target |
| TXT   | `_uppity-challenge.status.example.com` | A token unique to this claim |

The CNAME sends traffic to the instance. The TXT record proves control of the zone, because a CNAME
left behind by a previous owner would otherwise pass for anyone.

The settings page checks the records when the domain is added and on "Check DNS". `worker-monitor`
checks live domains about once an hour, on a timer of its own that monitor checks never wait for.
After three checks in a row that find either record gone, the page leaves the domain and anyone who
controls its DNS can claim it. The settings page then shows the domain as lost, the owners and
admins get an email from the account address, and `audit_log` gets a
`status_page.domain_lapse` row. Putting the records back and using "Check DNS" restores it. A
resolver failure does not count, so a DNS outage does not take a page off its domain. Domains must
be subdomains: an apex has no CNAME, and a provider's flattened or proxied record does not pass the
check.

To move a domain to another page, remove it from the first page, or delete the first page's TXT
record and wait for it to lapse. A claim on a domain another page serves is refused.

Verification only reads DNS. The server connects to nothing at the customer's domain.

## What the instance serves on a domain

A verified domain serves that one page and its incident pages. The root redirects to the page, so
its URLs read `https://status.example.com/status/<slug>`. Sign-in, the API and every other route
answer 404 there, except `/api/health`. Requests there read no session and responses set no cookies.
A private page's domain answers 404 throughout.

Mail keeps linking to `BETTER_AUTH_URL`, including confirm and unsubscribe links, so those work
whatever happens to the domain.

Any other hostname serves the app, as it did before custom domains. That includes a host missing
from `BETTER_AUTH_URL`, `ORIGIN` and `BETTER_AUTH_TRUSTED_ORIGINS`, such as `*.up.railway.app`, and
a domain that has lapsed. The session cookie is host-only, so it never reaches them. The one
difference is that a page with a verified domain answers 404 on a hostname that is not an app host,
so a lookalike domain pointed at the instance cannot show it. IP addresses and internal names still
show every public page.

## How form posts stay same-origin

SvelteKit compares a form post's `Origin` with the app's origin before any hook runs. With `ORIGIN`
set, that origin never changes, so a post from `https://status.example.com` would fail. `serve`
rewrites `Origin` to the pinned value only when it names the request's own `Host`, and marks the
request. The first hook then refuses a marked request with a 403 unless its host is a verified
domain, so a `Host` header alone trusts nothing. A post from any other site keeps its `Origin` and
fails. Without `ORIGIN` the origin comes from `Host`, or from `HOST_HEADER` if you set it, which you
should only do when your proxy overwrites that header.

## Configuration

`UPPITY_STATUS_PAGE_CNAME_TARGET` is the hostname customers point their CNAME at. With
`SELF_HOSTED=true` it defaults to the host of `BETTER_AUTH_URL`. It must be a public DNS name, and
without one the settings page does not offer custom domains. Set it on the web server only: a live
domain is rechecked against the target it was verified on, so changing the value does not disturb
existing domains.

Domain values stored before verification existed became unverified claims when the migration ran.
They serve nothing until the page's owner creates the records and checks them.

## The reverse proxy

The server speaks plain HTTP, so TLS for a custom domain ends at your proxy. The proxy must:

- Pass the original `Host` header. A proxy that rewrites it hides the domain from the server.
- Set `X-Real-IP`, or another header, on every request and overwrite what the client sent. Set
  `CLIENT_IP_HEADER` to that header's name, so rate limits on the subscribe form see the visitor.
- Obtain a certificate for each domain. Add a domain to the proxy once the customer's page shows
  it as active.

Set `ORIGIN` to an `https://` address when the proxy terminates TLS, because a custom domain's form
posts must match its scheme.

### Caddy

Caddy passes `Host` through and manages certificates by itself. List each domain:

```caddyfile
uppity.example.com, status.customer-a.com, status.customer-b.com {
	reverse_proxy uppity:3000 {
		header_up X-Real-IP {remote_host}
	}
}
```

### Traefik

Traefik also passes `Host` through. Add each domain to the router's rule:

```yaml
http:
  routers:
    uppity:
      rule: Host(`uppity.example.com`) || Host(`status.customer-a.com`)
      service: uppity
      entryPoints: [websecure]
      tls:
        certResolver: letsencrypt
  services:
    uppity:
      loadBalancer:
        servers:
          - url: http://uppity:3000
```

Traefik sets `X-Real-Ip` and overwrites what the client sent, unless the client address is listed
under `forwardedHeaders.trustedIPs`.

## Cloudflare Turnstile

If the instance uses Turnstile, add each custom domain to the widget's hostnames in the Cloudflare
dashboard. Cloudflare limits how many a widget can list. Until a domain is listed, the widget on
that domain fails and the subscribe form refuses submissions. The status page itself still loads.
The server accepts a token only from the app's host or from the verified domain of the page the
form belongs to.
