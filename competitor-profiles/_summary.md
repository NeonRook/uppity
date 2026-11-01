# Competitor evidence summary

This is planning material, not a price list, an offer or a comparison page. It records what six vendors publish about themselves, so that later documents can cite a source. Uppity's own plan figures live in `PRODUCT.md` as a business plan, and this document does not restate them.

Every source was accessed on 2026-11-01. Sources are the vendor's own pricing pages, docs, help centre and terms, plus the GitHub repository for Uptime Kuma. Vendors change these pages, so reread the source before citing a claim. "Not mentioned" means the pages read are silent on the point, not that the vendor lacks the feature.

Prices are per month on monthly billing, unless a line says otherwise. Each pricing page was also loaded in a browser on 2026-11-01, with the billing and page-type switches set to each state. Hyperping and UptimeRobot localise by visitor and showed EUR from a German address, with the same numerals Hyperping lists in USD in its page source. Instatus, Better Stack and Statuspage showed USD.

## At a glance

| Vendor               | Free plan                  | First paid plan   | Top listed price                      | Self-hosting  | Account SSO first on                     | Audit logs first on          | Private pages first on    |
| -------------------- | -------------------------- | ----------------- | ------------------------------------- | ------------- | ---------------------------------------- | ---------------------------- | ------------------------- |
| Instatus             | 15 monitors                | Pro, $20          | Business, $300; Enterprise is custom  | Not mentioned | SAML on Business, Google on all plans    | Admin activity on Business   | Private Pro, $50          |
| Hyperping            | 20 monitors                | Essentials, $29   | Business, $299; Enterprise is custom  | Not mentioned | SAML and OIDC on Pro, $89                | Business, $299               | Pro, $89                  |
| Atlassian Statuspage | Public page, no monitoring | Hobby, $29        | Enterprise, $1,499                    | Not mentioned | Startup, $99, with Atlassian Guard       | Activity Log, no plan stated | Private Starter, $79      |
| UptimeRobot          | 50 monitors                | Solo, from EUR 10 | Scale, EUR 179; Enterprise is a quote | Not mentioned | Not mentioned                            | Not mentioned                | Team, EUR 35, by password |
| Better Stack         | 10 monitors                | Usage-based       | No top plan listed                    | Not mentioned | Google included, generic SAML enterprise | $250 add-on                  | Listed, no plan stated    |
| Uptime Kuma          | Open source                | None              | None                                  | Yes           | Not in release 2.5.9                     | Not verified                 | Not verified              |

## Statements in `PRODUCT.md`

`PRODUCT.md` carries these vendor statements. Three are out of date and one is partly out of date. Comparison pages should cite the current fact column.

| Statement                                                                                       | Result             | Current fact                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instatus jumps from $20 to $300, with SAML SSO, private pages and subscriber ceilings behind it | Partly out of date | Pro is $20 and Business is $300. Private Pro at $50 and Select at $100 sit between them, so private pages start at $50. SAML SSO is on Business, and subscribers go from 5,000 on Pro to 25,000 on Business. ([pricing](https://instatus.com/pricing))                                           |
| Instatus's Business tier gates SAML SSO and its SLA together                                    | Out of date        | SAML SSO is on Business. "99.99% Uptime SLA" is listed on Enterprise. ([pricing](https://instatus.com/pricing))                                                                                                                                                                                  |
| Instatus's signup "takes 30 seconds"                                                            | Confirmed          | The page says "Takes 30 seconds". ([home](https://instatus.com/))                                                                                                                                                                                                                                |
| Hyperping gates SSO and audit logs at $299                                                      | Out of date        | Audit logs are Business only, at $299. SAML and OpenID Connect sign-in are "included from Pro at no extra charge", and Pro is $89. Status page SSO is a separate Business option. ([pricing](https://hyperping.com/pricing), [login methods](https://hyperping.com/docs/projects/login-methods)) |
| Hyperping's $299 buys 1,000 monitors                                                            | Confirmed          | Business has 1,000 monitors at $299, or $249 per month on yearly billing. Enterprise sits above it. ([pricing](https://hyperping.com/pricing))                                                                                                                                                   |
| Atlassian Statuspage gates RBAC at $399 and ladders to $1,499                                   | Confirmed          | On public pages RBAC starts on Business at $399, and Enterprise is $1,499. On private pages it starts on Corporate at $599. ([pricing](https://www.atlassian.com/software/statuspage/pricing), [RBAC](https://support.atlassian.com/statuspage/docs/set-up-role-based-access-control/))          |
| Atlassian Statuspage performs no monitoring                                                     | Confirmed          | "Statuspage does not do any direct monitoring of your websites or servers". ([docs](https://support.atlassian.com/statuspage/docs/what-is-statuspage/))                                                                                                                                          |
| UptimeRobot has a 50-monitor free tier                                                          | Confirmed          | Free has 50 monitors at 5-minute checks. ([pricing](https://uptimerobot.com/pricing/))                                                                                                                                                                                                           |
| Uptime Kuma has 31 monitor types, 90+ integrations and 89.6k stars                              | Out of date        | Release 2.5.9 has 34 monitor types and 108 notification providers by source count. The repository had 93,132 stars. ([source](https://github.com/louislam/uptime-kuma/blob/2.5.9/src/pages/EditMonitor.vue), [repository](https://api.github.com/repos/louislam/uptime-kuma))                    |

This document records no reliability claim for any vendor. `PRODUCT.md` rules out Statuspage as a public benchmark, so its section below is reference only.

## Instatus

Accessed 2026-11-01. Prices use "$", and the pages do not name a currency. Yearly billing takes 25% off.

- Starter is free, with 15 monitors, 2-minute checks, 200 subscribers, 5 team members and public pages only. ([pricing](https://instatus.com/pricing))
- Pro is $20, or $15 on yearly billing, with 50 monitors, 30-second checks, 5,000 subscribers and 50 team members. ([pricing](https://instatus.com/pricing))
- Private Pro is $50, or $37.50 on yearly billing. Select is $100, or $75 on yearly billing. A page-type switch on the Pro column changes its name and price between Pro, Private Pro and Select, and the limits shown stay those of Pro. ([pricing](https://instatus.com/pricing))
- Business is $300, or $225 on yearly billing, with 1,000 monitors, 30-second checks, 25,000 subscribers, unlimited team members and every page type. ([pricing](https://instatus.com/pricing))
- Enterprise is custom priced. ([pricing](https://instatus.com/pricing))
- Google SSO is on all plans. SAML SSO first appears on Business. Multiple SSO connections and SCIM directory sync are on Enterprise. ([SSO](https://instatus.com/help/team/sso), [pricing](https://instatus.com/pricing))
- Per-issue activity is on all plans, and the admin activity display requires Business. ([activity](https://instatus.com/help/team/activity))
- Custom domains are 1 or more on Pro and 3 or more on Business. The API is marked on all plans. ([pricing](https://instatus.com/pricing))
- The pricing table lists these monitor types on all plans: Website, Keyword, API, Cron / Heartbeat, Ping, SSL, TCP / UDP, DNS. ([pricing](https://instatus.com/pricing))
- Alert channels are Email, SMS, Slack, Discord, Microsoft Teams, Phone call, Webhook, WhatsApp and Mobile app. ([alerts](https://instatus.com/help/monitoring/alerts))
- Non-profits and open-source projects can email for a free Pro account. ([pricing](https://instatus.com/pricing))

## Hyperping

Accessed 2026-11-01. The page source lists USD, and a browser loaded from Germany showed the same numerals in EUR. The page shows yearly-billing figures by default, and Yearly gives "2 months free". Monthly billing shows $29, $89 and $299, and the same switch shows EUR figures when the visitor is in Europe.

- Free is $0, with 20 monitors, 5-minute checks, 1 seat and no subscribers. ([pricing](https://hyperping.com/pricing))
- Essentials is $29, or $24 on yearly billing, with 50 monitors, 30-second checks, 100 subscribers and 3 seats. ([pricing](https://hyperping.com/pricing))
- Pro is $89, or $74 on yearly billing, with 250 monitors, 30-second checks, 1,000 subscribers and 10 seats. ([pricing](https://hyperping.com/pricing))
- Business is $299, or $249 on yearly billing, with 1,000 monitors, 20-second checks, unlimited subscribers and 20 seats. ([pricing](https://hyperping.com/pricing))
- Enterprise is custom priced. ([pricing](https://hyperping.com/pricing))
- Google sign-in is on all plans. Native SAML for Okta, Microsoft Entra ID, Google Workspace, KeyHub and JumpCloud, and OpenID Connect, start on Pro. Other SAML providers through WorkOS require Business. ([login methods](https://hyperping.com/docs/projects/login-methods))
- Status page SSO requires Business and is billed separately, at $49 per connection per month for direct SAML and OpenID Connect, and $99 for other providers. ([private status pages](https://hyperping.com/docs/status-page/private-status-pages))
- Audit logs are on Business only. ([pricing](https://hyperping.com/pricing))
- Private status pages first appear on Pro. ([private status pages](https://hyperping.com/docs/status-page/private-status-pages))
- Custom domains are 1 on Essentials, 3 on Pro and 10 on Business. ([pricing](https://hyperping.com/pricing))
- A 99.9% monthly uptime commitment for core services applies to all paid plans. ([SLA](https://hyperping.com/sla))
- The FAQ says all paid plans have the API. ([pricing](https://hyperping.com/pricing))
- Monitor protocols are HTTP, ICMP ping, Port, DNS and Browser check. Pricing also lists SSL monitoring, Healthchecks and keyword checks. ([create a monitor](https://hyperping.com/docs/monitoring/create-monitor), [pricing](https://hyperping.com/pricing))
- The features page lists Email, SMS, Phone calls, Slack, Discord, Telegram, PagerDuty, OpsGenie, Microsoft Teams and Webhooks. ([features](https://hyperping.com/features))

## Uptime Kuma

Accessed 2026-11-01. Figures are from release 2.5.9, published 2026-10-31, and the GitHub API at 2026-11-01T08:51:21Z.

- The licence is MIT. ([licence](https://github.com/louislam/uptime-kuma/blob/2.5.9/LICENSE))
- The repository has 93,132 stars. ([repository](https://api.github.com/repos/louislam/uptime-kuma))
- The README calls it "an easy-to-use self-hosted monitoring tool" and gives Docker and non-Docker install steps. It lists no paid plans. ([README](https://github.com/louislam/uptime-kuma/blob/2.5.9/README.md))
- The README gives "20-second intervals" and "90+ notification services". ([README](https://github.com/louislam/uptime-kuma/blob/2.5.9/README.md))
- `src/pages/EditMonitor.vue` has 34 distinct monitor type values, from 35 options with one repeat. Two show only outside containers, and the group and manual types are not probes, so a count of probes alone is lower. ([source](https://github.com/louislam/uptime-kuma/blob/2.5.9/src/pages/EditMonitor.vue))
- `server/notification.js` registers 108 notification providers. ([source](https://github.com/louislam/uptime-kuma/blob/2.5.9/server/notification.js))
- Release 2.5.9 has no SAML, OIDC or better-auth dependency, and the request for OpenID or SAML login is open. ([package.json](https://github.com/louislam/uptime-kuma/blob/2.5.9/package.json), [issue 553](https://github.com/louislam/uptime-kuma/issues/553))
- Multi-user support is an open request, and a pull request for it is open and unmerged. ([issue 6200](https://github.com/louislam/uptime-kuma/issues/6200), [PR 7614](https://github.com/louislam/uptime-kuma/pull/7614))
- The README lists multiple status pages, mapping status pages to domains, 2FA and proxy support. ([README](https://github.com/louislam/uptime-kuma/blob/2.5.9/README.md))

## Atlassian Statuspage

Accessed 2026-11-01. Prices use "$", and the page lists monthly prices only.

- Public pages: Free has 100 subscribers, Hobby is $29 with 250, Startup is $99 with 1,000, Business is $399 with 5,000, and Enterprise is $1,499 with 25,000. ([pricing](https://www.atlassian.com/software/statuspage/pricing))
- Private pages: Starter is $79 for 50 employees, Growth is $249 for 300, Corporate is $599 for 1,000, and Enterprise is $1,499 for 5,000. ([pricing](https://www.atlassian.com/software/statuspage/pricing))
- Audience-specific pages start at $300. ([pricing](https://www.atlassian.com/software/statuspage/pricing))
- Monitoring tools can be integrated, or the API can update a page. Statuspage does no direct monitoring. ([docs](https://support.atlassian.com/statuspage/docs/what-is-statuspage/))
- Team member SSO "with Atlassian Guard" first appears on Public Startup and Private Starter. ([pricing](https://www.atlassian.com/software/statuspage/pricing))
- RBAC is "available to any organization that has a page on a Business, Corporate, Enterprise, or Audience Specific plan". ([RBAC](https://support.atlassian.com/statuspage/docs/set-up-role-based-access-control/))
- A custom domain first appears on Public Hobby. REST API access is on Public Free. ([pricing](https://www.atlassian.com/software/statuspage/pricing))
- An Activity Log shows changes to users, components and incidents, with no plan requirement stated. ([activity log](https://support.atlassian.com/statuspage/docs/view-the-activity-log/))

## UptimeRobot

Accessed 2026-11-01. These are the EUR amounts served to a request from Germany, read with the billing switch on Monthly. The vendor says prices vary by region and that annual billing saves about 15%. On annual billing the same page shows Solo EUR 9 and EUR 19, Team EUR 35, and Scale EUR 65 and EUR 149. ([pricing](https://uptimerobot.com/pricing/), [pricing.md](https://uptimerobot.com/pricing.md))

- Free has 50 monitors, 5-minute checks and 1 status page. ([pricing](https://uptimerobot.com/pricing/))
- Solo is EUR 10 for 10 monitors and EUR 22 for 50, with 60-second checks and 3 status pages. ([pricing](https://uptimerobot.com/pricing/))
- Team is EUR 41, with 100 monitors, 30-second checks, 100 status pages and 3 login seats. ([pricing](https://uptimerobot.com/pricing/))
- Scale is EUR 77 for 200 monitors and EUR 179 for 500, with 15-second checks, unlimited status pages and 5 login seats. ([pricing](https://uptimerobot.com/pricing/))
- Enterprise is a custom quote and lists an SLA. ([pricing.md](https://uptimerobot.com/pricing.md))
- "The free plan can be used for business, commercial, and revenue-generating projects". ([help](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan))
- The terms require "only having a single account". ([terms](https://uptimerobot.com/terms/))
- Status page subscribers and "Password on status page" first appear on Team. "Own domain" first appears on Solo. The API row is marked on all plans. ([pricing](https://uptimerobot.com/pricing/))
- Free has HTTPS, Keyword, Ping and Port monitors. Solo adds API, UDP, DNS, SSL, Domain expiry and Heartbeat. ([pricing](https://uptimerobot.com/pricing/))
- The integrations page lists 21 channels, by count from the page. ([integrations](https://uptimerobot.com/integrations/))

## Better Stack

Accessed 2026-11-01. Prices use "$", and the page does not name a currency. Pricing is usage-based, with no ladder of named monitoring plans. Annual payment is "~2 months off".

- The free tier is labelled "Free for personal projects", with 10 monitors and heartbeats and 1 status page. ([pricing](https://betterstack.com/pricing))
- A responder licence is $34, or $29 on annual billing. ([pricing](https://betterstack.com/pricing))
- An extra 50 monitors are $25, or $21 on annual billing. ([pricing](https://betterstack.com/pricing))
- Each extra public status page is $15, or $12 on annual billing. An extra 1,000 subscribers are $40. ([pricing](https://betterstack.com/pricing))
- Checks run "Up to 30 seconds" apart on paid plans, and the docs give 3 minutes on free plans. ([check frequency](https://betterstack.com/docs/uptime/check-frequency/))
- Google SSO is included. Azure and Okta are $5 per user each, and generic SAML SSO is marked "enterprise". ([pricing](https://betterstack.com/pricing))
- Status page SSO is $250 per page, and audit logs are $250, each $208 on annual billing. ([pricing](https://betterstack.com/pricing))
- Private status pages are listed. Password authentication is $50 per page, or $42 on annual billing. ([pricing](https://betterstack.com/pricing))
- Monitor types are Uptime, Keyword, Ping, Heartbeats, Playwright, API, DNS, Domain expiration, SSL certificate and TCP/UDP port. ([monitors](https://betterstack.com/docs/uptime/uptime-monitor/))
- The pricing page does not use the term self-hosting. It lists "Custom VPC deployment", "Custom cluster deployment" and "Host data in your own S3 bucket". ([pricing](https://betterstack.com/pricing))

## Unverified

- Instatus: the limits on Private Pro and Select. The table keeps the Pro values when the page-type switch changes, and no page states that the variants share them.
- Instatus: its help page on upgrading says Pro adds "unlimited teammates and subscribers", while the pricing page lists 50 and 5,000. This document uses the pricing page. ([help](https://instatus.com/help/team/upgrade))
- Hyperping: the plan requirement for roles, whether Free has the API, and the words "shared infrastructure" in `PRODUCT.md`. No page read describes the hosting of Business.
- UptimeRobot: USD prices, and whether SSO or audit logs exist. No page read mentions either.
- Statuspage: any SLA, and whether the Activity Log varies by plan.
- Better Stack: plan conditions for RBAC, custom sub-domains and the API, and the terms of an Enterprise plan.
- Uptime Kuma: status page subscribers, private status pages, roles, and whether SSO arrives in 3.0.
- Instatus, Hyperping, UptimeRobot and Statuspage: an explicit statement that self-hosting is not offered. The pages read are silent.
- Hyperping and UptimeRobot: USD prices on a rendered page. Both showed EUR from a German address. Hyperping's page source lists USD, and UptimeRobot's USD amounts are unread.
