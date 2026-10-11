# Status page email abuse controls

How status page and uptime monitoring products keep their email features from becoming a spam or phishing relay. Researched 2026-10-11 against official docs, pricing pages, terms, and source code. "Not documented" means no primary source was found, not that the feature is absent.

Source code was read at these commits:

- Openstatus `openstatusHQ/openstatus@09cc81a` (2026-10-11)
- Cachet `cachethq/core@57b44a8` (2026-10-05), the package that holds Cachet 3.x logic
- Uptime Kuma `louislam/uptime-kuma@7982ce0` (2026-10-11)

## Summary

- **Double opt-in is the norm for visitor sign-ups.** Every product with self-serve email subscriptions that documents the flow requires a confirmation click: Atlassian Statuspage, Instatus, Hyperping, UptimeRobot, Better Stack, incident.io, Openstatus, and Cachet. Link lifetimes vary widely: 1 hour (Cachet), 2 days (UptimeRobot), 7 days (Openstatus), 90 days (Statuspage).
- **The cost control that shows up everywhere is plan gating, not CAPTCHA.** Hyperping, UptimeRobot and Openstatus give free plans no subscribers at all. Better Stack lets only Small Team and up notify subscribers. Statuspage and Instatus allow subscribers on free plans but cap them at 100 and 200.
- **Few vendors document bot defenses on the sign-up form.** Statuspage uses reCAPTCHA plus a per-IP limit on SMS sign-ups. Cachet throttles the subscribe route to 6 requests per minute. UptimeRobot limits resending a confirmation to once per hour per address. Openstatus refuses to send a second confirmation while one is pending. Nobody else documents anything.
- **Operator-added recipients usually skip confirmation, but the leading vendors are tightening this.** Atlassian turned off its `skip_confirmation_notification` API flag and grants exceptions only through support. Instatus limits its bypass to Pro and has staff review the first use on each page. Better Stack and Openstatus still confirm API or dashboard adds immediately.
- **Alert-channel email confirmation is inconsistent.** UptimeRobot email contacts start out "not activated". Hyperping sends email alerts only to the account's own address and confirms any change to it. Openstatus, Pingdom and StatusCake accept any address without a documented confirmation step.
- **Custom sender domains are a premium, DNS-verified feature, or are not offered at all.** Statuspage requires SPF and DKIM records. Hyperping offers it only on Business. Better Stack charges $250 per page per month and sets it up by hand through support. incident.io and Openstatus send from a single fixed address. Instatus has customers bring their own Mailgun, SendGrid, Postmark or SES account. Self-hosted Cachet and Uptime Kuma use the operator's SMTP server.
- **One-click unsubscribe is rarely documented.** Every vendor that documents unsubscribe puts a link in the email. Only Sorry (not on the priority list) states RFC 8058 support. Openstatus has an RFC 8058 POST endpoint, but its page-update send path sets no `List-Unsubscribe` header. Statuspage is the only vendor that documents bounce suppression: it quarantines addresses after a permanent failure and purges them after 90 days.
- **No vendor documents a separate sending account for alerts and subscriber mail.** The nearest is Atlassian, which says it uses "multiple email providers". Openstatus sends alerts, invitations and subscriber mail from the same `notifications.openstatus.dev` subdomain.

## Comparison

| Product | Subscriber opt-in | Sign-up abuse controls | Subscriber caps | Gating | Alert email recipient confirms? | Sender / custom domain / BYO | Unsubscribe | Email AUP |
|---|---|---|---|---|---|---|---|---|
| Atlassian Statuspage | Double opt-in, 90-day link | reCAPTCHA for bot-like users; SMS 10 per IP per 4h | Free 100, Hobby 250, Startup 1,000, Business 5,000, Enterprise 25,000 | Email on Free; SMS paid only | N/A (not a monitor) | Custom From with SPF + DKIM; plan not documented | Link in email; quarantine on permanent failure, purge at 90 days | "spam" banned in Atlassian AUP |
| Instatus | Required by default; Pro can switch to no confirmation | Not documented | Starter 200, Pro 5,000, Business 25,000 | Bypass and CSV import are Pro only; first bypass reviewed by staff | Not documented | Default `subdomain@instatus.com`; BYO Mailgun, SendGrid, Postmark, SES | Admin removal documented; email link not documented | No spam clause; generic "illegal purpose" |
| Hyperping | Confirmation required | Not documented | Free 0, Essentials 100, Pro 1,000, Business unlimited | No subscribers on Free | Alerts go only to the account email; changing it requires confirmation | "Custom domain emails" on Business only; SMS needs your own Twilio | Not documented beyond admin delete | "spam" banned in ToS section 4 |
| UptimeRobot | Double opt-in, 2-day link | Confirmation resend once per hour per address | Not documented | Subscribers on Team and Scale only | Contacts have a "not activated" state; extra emails need paid seats | Not documented | Link in every email and in the page footer | No email clause beyond spam referrals |
| Better Stack | Double opt-in (also for webhook contacts) | Not documented | 1,000 included, +$40/month per 1,000 | Notifying subscribers is Small Team onward | Recipients are invited team members; confirmation not documented | Own domain $250 per page per month, set up via support | Link in every email | Bans "unsolicited mass e-mail" |
| incident.io | "Usually" confirm on public pages | Not documented | No limit | Not documented | N/A (on-call users) | Fixed `no-reply@status.incident.io`; reply-to only | Not documented | Not researched |
| Openstatus (OSS) | Double opt-in, 7-day token | Blocks a second confirmation while one is pending; no CAPTCHA | None in code | Free plan has no subscribers | No confirmation; Free allows 1 channel | Fixed `notifications@notifications.openstatus.dev` via Resend; custom sender is an open issue | Link plus RFC 8058 POST endpoint; no header set | Not researched |
| Cachet (OSS) | Double opt-in, 60-minute signed link | Subscribe route throttled 6 per minute | None | Subscriptions off by default | N/A | Operator's own SMTP | Signed unsubscribe link; no header | N/A |
| Uptime Kuma (OSS) | No subscriptions (feature request open since 2021) | N/A | N/A | N/A | No confirmation; mail goes through the operator's own SMTP | Operator's own SMTP or API provider | N/A | N/A |
| StatusCake | Not documented; admins can add email, SMS, webhook subscribers | Not documented | Not documented | Not documented | Not documented | Not documented | Admin removal only documented | Not researched |
| Pingdom | No subscriptions on the public status page | N/A | N/A | N/A | Not documented; unlimited contacts on any plan | Not documented | N/A | Not researched |

## Atlassian Statuspage

**Sign-up.** Self-serve subscribers receive a confirmation email, and "The confirmation link must be clicked in order to receive any notifications". The link expires after 90 days. Statuspage "uses Google's reCAPTCHA for all self-serve subscriptions", and users that Google flags as bot-like must pass a challenge. SMS sign-ups are rate limited to "10 SMS subs per IP per 4 hours" and are available only on paid plans. Source: [Enable subscribers](https://support.atlassian.com/statuspage/docs/enable-subscribers/).

**Caps.** Public pages allow 100 (Free), 250 (Hobby, $29), 1,000 (Startup, $99), 5,000 (Business, $399) and 25,000 (Enterprise, $1,499) subscribers ([pricing](https://www.atlassian.com/software/statuspage/pricing)). Only active subscribers count toward the cap. On trials, active, quarantined, unconfirmed and deleted subscribers all count toward a 25-subscriber limit ([How are subscribers counted](https://support.atlassian.com/statuspage/docs/how-are-subscribers-counted)).

**Operator-added subscribers.** Admins adding a subscriber by hand must "Get explicit consent from subscribers before adding them". The subscriber is marked active immediately and receives a confirmation email with an unsubscribe link ([Manually add subscribers](https://support.atlassian.com/jira-service-management-cloud/docs/manually-add-subscribers-to-a-status-page/)). The docs still describe an API flag `skip_confirmation_notification` ([Enable subscribers](https://support.atlassian.com/statuspage/docs/enable-subscribers/)). Atlassian staff on the Community forum said the flag had been turned off, and that exceptions for bulk imports are granted temporarily through a support ticket ([thread 2622850](https://community.atlassian.com/forums/Statuspage-questions/Skip-Confirmation-Notification-option-no-longer-honored-on-API/qaq-p/2622850), [thread 2879842](https://community.atlassian.com/forums/Statuspage-questions/Is-it-possible-to-subscribe-users-WITHOUT-notifying-them/qaq-p/2879842)). Treat this as staff statements, not formal docs.

**Sending.** A custom From address "will require adding records to your DNS" ([Customize email notifications](https://support.atlassian.com/statuspage/docs/customize-email-notifications/)). Customers must reference Atlassian's SPF record in their own and add several DKIM records "because we have multiple email providers" ([Set up SPF and DKIM](https://support.atlassian.com/statuspage/docs/set-up-spf-and-dkim-signatures/)). The plan required for a custom From address is not documented. A public bug names SendGrid as one of those providers ([STATUS-702](https://jira.atlassian.com/browse/STATUS-702)). No bring-your-own SMTP.

**Unsubscribe and suppression.** Email subscribers unsubscribe by clicking "Unsubscribe" in the email, or through "Manage Subscriptions" when component subscriptions are on ([Enable subscribers](https://support.atlassian.com/statuspage/docs/enable-subscribers/)). Email subscribers are quarantined after a "permanent failure", for example when the recipient marks the mail as spam. Quarantined subscribers get no further notifications and are purged after 90 days unless they re-subscribe ([View quarantined subscribers](https://support.atlassian.com/statuspage/docs/view-quarantined-subscribers/)). STATUS-702 reported hard bounces landing on a SendGrid suppression list without being quarantined. It was closed as "Timed out" in March 2026, not as fixed ([STATUS-702](https://jira.atlassian.com/browse/STATUS-702)). RFC 8058 one-click unsubscribe: not documented.

**Policy.** The Atlassian AUP bans "Using the services to generate or send chain letters or spam" ([AUP](https://www.atlassian.com/legal/acceptable-use-policy)).

**Alert channels.** Not applicable. Statuspage is not a monitoring product.

## Instatus

**Sign-up.** The page-level `subscriberConfirmationMode` defaults to `REQUIRED`, meaning subscribers must confirm by email. `WELCOME` (added with a welcome email) and `NONE` (added silently) are Pro only. The API flag `autoConfirm` "adds the subscriber immediately without sending confirmation or welcome emails". It is Pro only, and Instatus reviews the first use on each page; until then the subscriber gets a confirmation email instead ([Subscribers API](https://instatus.com/help/api/subscribers)). CAPTCHA and rate limits: not documented ([Subscribers](https://instatus.com/help/status-page/subscribers)).

**Caps.** Starter (free) 200 subscribers, Pro 5,000, Business 25,000 ([pricing](https://instatus.com/pricing)). CSV import is a Pro feature ([Email notifications](https://instatus.com/help/status-page/notifications/email)).

**Alert channels.** The alerts page lists email as a channel but does not say who can receive alerts or whether recipients confirm ([Alerts](https://instatus.com/help/monitoring/alerts)). Not documented.

**Sending.** By default, "We send emails from your-subdomain@instatus.com". A custom sender works by connecting the customer's own Mailgun, SendGrid, Postmark or Amazon SES credentials ([Email notifications](https://instatus.com/help/status-page/notifications/email)). Under this model the customer's provider carries the reputation risk for their custom-sender mail. The plan required is not documented on that page.

**Unsubscribe.** An admin "Unsubscribe" button is documented ([Subscribers](https://instatus.com/help/status-page/subscribers)). Self-serve links and List-Unsubscribe: not documented.

**Policy.** The terms contain no spam clause. The closest are bans on illegal use and API abuse ([Terms](https://instatus.com/policies/terms)).

## Hyperping

**Sign-up.** "Email: subscribers will need to confirm their subscription." Admins can add email subscribers by hand ([Create a status page](https://hyperping.com/docs/status-page/create-status-page)), up to 500 at once. Slack, Teams and SMS subscribers "must subscribe through their own channels" ([Subscribers](https://hyperping.com/docs/status-page/subscribers), [Go-live checklist](https://hyperping.com/docs/status-page/go-live-checklist)). Whether operator-added emails get a confirmation email is not documented. CAPTCHA and rate limits: not documented.

**Caps and gating.** Subscribers: Free none, Essentials ($24/month) 100, Pro ($74) 1,000, Business ($249) unlimited ([pricing](https://hyperping.com/pricing)).

**Alert channels.** Email alerts use "the email you signed up with, at an account level". Changing it sends "an email to confirm your new email address" ([Notification channels](https://hyperping.com/docs/projects/notification-channels)). The docs describe no way to send email alerts to an arbitrary address.

**Sending.** "Custom domain emails" is on Business and Enterprise only ([pricing](https://hyperping.com/pricing)). The DNS records it requires are not documented. SMS to subscribers requires "your own Twilio account" ([Create a status page](https://hyperping.com/docs/status-page/create-status-page)), so SMS is bring-your-own-provider.

**Unsubscribe.** Only admin deletion is documented ([Subscribers](https://hyperping.com/docs/status-page/subscribers)).

**Policy.** The terms ban using the services "to distribute malware, spam, or any harmful content" ([Terms](https://hyperping.com/terms), section 4).

## UptimeRobot

**Sign-up.** "this is a double opt-in". "The confirmation link expires after 2 days". A new link can be requested "only once per hour per email address". Subscribers are emailed only when the operator publishes an announcement, not on monitor up or down events ([Status page subscribers](https://help.uptimerobot.com/en/articles/16160090-status-page-subscribers-how-email-updates-work)). CAPTCHA: not documented.

**Gating.** "Status page subscribers" is unavailable on Free and Solo and included on Team (€35 to €41/month) and Scale ([pricing comparison table](https://uptimerobot.com/pricing/)). Subscriber caps: not documented.

**Alert channels.** Each user has one email channel, "typically the username used to register". Additional email or phone contacts require paid Notify-only seats ([Personal notification channels](https://help.uptimerobot.com/en/articles/11360953-uptimerobot-personal-notification-channels-setup-guide)). Alert contacts have a status of "0 - not activated, 1 - paused, 2 - active" ([legacy API](https://uptimerobot.com/api/legacy/)), and a contact that is not Active receives nothing ([Missing alerts](https://help.uptimerobot.com/en/articles/16160089-missing-alert-notifications-in-uptimerobot-troubleshooting-guide)). Only a third-party guide describes the activation email itself ([Statuspal](https://help.statuspal.io/article/25-configure-uptimerobot-monitoring-for-a-service)).

**Sending.** Sender domain, custom sender domains and bring-your-own SMTP: not documented.

**Unsubscribe.** Every notification email carries an unsubscribe link, and the page footer has one too ([Status page subscribers](https://help.uptimerobot.com/en/articles/16160090-status-page-subscribers-how-email-updates-work)). List-Unsubscribe: not documented.

**Policy.** The terms mention spam only for affiliate and referral traffic, and otherwise ban "illegal or abusive activity" ([Terms](https://uptimerobot.com/terms/)).

## Better Stack (Better Uptime)

**Sign-up.** "New subscribers must confirm their subscription by clicking a link sent to their e-mail. This prevents spam and ensures subscribers actually want to receive updates." Webhook subscriptions are confirmed by email to a contact address. Slack subscriptions are confirmed immediately ([Subscribing to status pages](https://betterstack.com/docs/uptime/subscribing-to-status-updates/)). Subscribers created through the API are confirmed immediately ([Create subscriber API](https://betterstack.com/docs/uptime/api/create-a-single-status-page-subscriber/)). CAPTCHA and rate limits: not documented.

**Caps and gating.** Each page includes 1,000 subscribers, and each additional 1,000 costs $40 per month ([pricing](https://betterstack.com/pricing)). "Notify subscribers" on manual reports is marked "(Small Team plan onward)" ([Status page updates](https://betterstack.com/docs/uptime/creating-status-report-and-status-update/)).

**Alert channels.** Alerts go to team members. Using an email address in an on-call schedule automatically invites that person ([Inviting team members](https://betterstack.com/docs/uptime/inviting-team-members/)). Whether alerts reach an invitee before they accept is not documented.

**Sending.** Sending from your own domain costs "$250 per page per month" ([pricing](https://betterstack.com/pricing)) and is set up by emailing hello@betterstack.com; otherwise mail comes from "the default Better Stack domain" ([Status page updates](https://betterstack.com/docs/uptime/creating-status-report-and-status-update/)). Bring-your-own SMTP: not documented.

**Unsubscribe.** "Every notification includes an unsubscribe link", usable without logging in ([Subscribing to status pages](https://betterstack.com/docs/uptime/subscribing-to-status-updates/)). List-Unsubscribe: not documented.

**Policy.** The terms ban using the service to "distribute, publish, send, or facilitate the sending of unsolicited mass e-mail or other messages" ([Terms](https://betterstack.com/terms)).

## incident.io status pages

**Sign-up.** Public page subscribers "will usually need to confirm their email (to ensure it's a valid subscription)" ([Internal vs public subscriptions](https://docs.incident.io/status-pages/internal-vs-public-subscriptions)). "There is no limit on the number of subscribers" ([Subscriber limits](https://docs.incident.io/status-pages/subscriber-limits)). CAPTCHA, rate limits and gating: not documented.

**Sending.** "all status page email notifications are sent from no-reply@status.incident.io" and the address "cannot be customized". Only reply-to can be set, and it does not apply to confirmation emails ([Email sender](https://docs.incident.io/status-pages/email-sender)). This is the most locked-down sender model in the set: customers cannot influence the From domain at all.

**Unsubscribe, alert channels.** Not documented. Alert recipients are on-call users of the product.

## Openstatus (open source)

**Sign-up.** Self-signup rows get a verification token that expires after 7 days (`VERIFICATION_EXPIRY_MS`, [upsert.ts#L22](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/services/src/page-subscriber/upsert.ts#L22)). The public subscribe procedure checks for a pending, unverified, unexpired row for the same address and page before sending another verification email ([statusPage.ts#L1412](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/api/src/router/statusPage.ts#L1412), described as an "Anti-spam check" in [has-pending.ts](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/services/src/page-subscriber/has-pending.ts)). The subscribe path has no CAPTCHA or IP rate limit; a `ratelimit` helper exists in the repo but is used only on login and marketing tools.

**Gating.** The Free ("Hobby") plan has `"status-subscribers": false`, and paid plans have `true` ([plan config](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/db/src/schema/plan/config.ts#L48)). The public subscribe procedure checks this flag ([statusPage.ts#L1404](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/api/src/router/statusPage.ts#L1404)). No subscriber count cap exists in code.

**Operator-added subscribers.** Dashboard adds insert `source: "vendor"` with `acceptedAt` set immediately, skipping verification ([create.ts#L143-L146](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/services/src/page-subscriber/create.ts#L143-L146)).

**Alert channels.** Email is not a plan-gated provider, and the address is only schema-validated ([notification/internal.ts](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/services/src/notification/internal.ts)). Channel count is limited by plan: Free 1, paid 10 to 20 ([plan config](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/db/src/schema/plan/config.ts#L64)). No recipient confirmation.

**Sending.** All mail goes through Resend. Monitor alerts use `openstatus <notifications@notifications.openstatus.dev>`, and page updates use `${pageTitle} <notifications@notifications.openstatus.dev>`, so alerts and subscriber mail share one sending subdomain ([client.tsx#L40](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/emails/src/client.tsx#L40), [#L232](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/packages/emails/src/client.tsx#L232)). A custom sender domain with DNS verification is an open request, and a maintainer replied "yes, we should do that!" on 2026-10-09 ([issue #2881](https://github.com/openstatusHQ/openstatus/issues/2881)).

**Unsubscribe.** Each page-update email links to `/unsubscribe/{token}` and `/manage/{token}`. The server has an "RFC 8058 One-Click Unsubscribe Endpoint" that accepts POST ([unsubscribe.ts](https://github.com/openstatusHQ/openstatus/blob/09cc81aa4df062d1bf3d7aa6319508ea2e53f261/apps/server/src/routes/public/unsubscribe.ts)). No `List-Unsubscribe` or `List-Unsubscribe-Post` header is set anywhere in the send code at this commit, so mail clients cannot discover the endpoint.

## Cachet (open source, self-hosted)

**Sign-up.** Subscriptions are off by default (`allow_subscribers = false`, [MailSettings.php#L9](https://github.com/cachethq/core/blob/57b44a8bac0b250b0d5751e93e0349070d14606e/src/Settings/MailSettings.php#L9)). `POST /subscribe` is throttled at `throttle:6,1`, which is 6 requests per minute per client, and the verify and unsubscribe routes are signed and throttled the same way ([PendingRouteRegistration.php#L48-L60](https://github.com/cachethq/core/blob/57b44a8bac0b250b0d5751e93e0349070d14606e/src/PendingRouteRegistration.php#L48-L60)). Unverified subscribers get a temporary signed link that expires after `auth.verification.expire`, defaulting to 60 minutes ([VerifySubscriberEmail.php#L55](https://github.com/cachethq/core/blob/57b44a8bac0b250b0d5751e93e0349070d14606e/src/Notifications/VerifySubscriberEmail.php#L55)). Incident and schedule notifications query only `->verified()` subscribers ([NotifyIncidentUpdateSubscribers.php#L43](https://github.com/cachethq/core/blob/57b44a8bac0b250b0d5751e93e0349070d14606e/src/Actions/Update/NotifyIncidentUpdateSubscribers.php#L43)). The API can create pre-verified subscribers through a `verified` flag ([Api/SubscriberController.php#L65](https://github.com/cachethq/core/blob/57b44a8bac0b250b0d5751e93e0349070d14606e/src/Http/Controllers/Api/SubscriberController.php#L65)).

**Sending.** The operator configures mailer, host, port, credentials and From in settings ([MailSettings.php#L15-L27](https://github.com/cachethq/core/blob/57b44a8bac0b250b0d5751e93e0349070d14606e/src/Settings/MailSettings.php#L15-L27)). Abuse risk lands on the operator's own mail account.

**Unsubscribe.** A signed unsubscribe URL appears in mail, including the verification email. No `List-Unsubscribe` header exists in the code.

## Uptime Kuma (open source, self-hosted)

Status pages have no email subscriptions. The request has been open since 2021 ([issue #916](https://github.com/louislam/uptime-kuma/issues/916)), and a 2025 duplicate was closed as not planned ([issue #5537](https://github.com/louislam/uptime-kuma/issues/5537)). Email alerts go through the operator's own SMTP server via nodemailer ([smtp.js](https://github.com/louislam/uptime-kuma/blob/7982ce027248231ee6508e71d8c74e7109f96062/server/notification-providers/smtp.js#L15)), or through API providers (Resend, SendGrid, Brevo, turboSMTP) using the operator's own keys. Recipients are not confirmed.

## StatusCake

Admins can add Email, SMS or Webhook subscribers by hand and can "manually unsubscribe a current subscriber" ([Add and manage subscribers](https://www.statuscake.com/kb/knowledge-base/status-page-how-to-add-and-manage-subscribers/)). Confirmation, consent, caps and gating: not documented. Contact groups take "Any email addresses that you would like the alerts to go to", with no documented confirmation ([Contact groups](https://www.statuscake.com/kb/knowledge-base/creating-a-contact-group-for-alerts/)).

## Pingdom

The public status page has no visitor subscriptions. Its settings cover only the template, overview, data range and custom domain ([Public status page](https://documentation.solarwinds.com/en/success_center/pingdom/content/topics/public-status-page.htm)). Alert contacts need no dashboard access: "You can add as many contacts as you like, regardless of what plan you are on". Confirmation is not documented ([Add and edit contacts](https://documentation.solarwinds.com/en/success_center/pingdom/content/gsg/add-edit-contacts.htm)).

## Context: mailbox provider and Scaleway rules

- **Google bulk sender rules.** "Marketing messages and subscribed messages must support one-click unsubscribe" with `List-Unsubscribe-Post: List-Unsubscribe=One-Click` and an HTTPS `List-Unsubscribe` URL. This applies to senders of more than 5,000 messages per day. All senders must keep the Postmaster spam rate below 0.3%, and Google recommends staying below 0.1% ([Google sender guidelines](https://support.google.com/a/answer/81126)). Sorry, a status page vendor, applies one-click unsubscribe to "all email notifications distributed through status pages" ([Sorry help](https://help.sorryapp.com/article/159-one-click-unsubscribe-in-emails)).
- **Scaleway TEM anti-spam policy.** TEM may only send transactional email, defined as mail "sent to a single recipient to confirm a transaction or an event", as opposed to "mass distributions of the same ... message to multiple recipients". On a blocklisting or high bounce rate, Scaleway reserves "the right to suspend the service and your account", judges "at its sole discretion" what counts as high, and may demand proof of a legal basis ([TEM anti-spam policy](https://tem.s3.fr-par.scw.cloud/antispam_policy.pdf)). The suspension is account-wide, so subscriber-mail abuse can take operator alerts down with it.
- **Scaleway domain locks.** A domain is "locked" when its reputation score drops below 50 and "blocked" when it is listed on Spamhaus. Scaleway sends an alert when 7% of a domain's mail is rejected within 24 hours ([reputation score](https://www.scaleway.com/en/docs/transactional-email/reference-content/understanding-tem-reputation-score/)). A Project cannot mix dedicated and shared IPs, so separating them requires separate Projects ([TEM FAQ](https://www.scaleway.com/en/docs/transactional-email/faq/)). Locks are per domain; suspension is per account.

## Implications for Uppity

- **Split the sending account, not just the domain.** Scaleway can suspend the whole account, not just a domain, over bounces or blocklisting, and it reads one-to-many mail as non-transactional. Operator alerts should therefore run on a separate Scaleway account, or a separate provider, from mail sent to visitor-entered addresses. A separate sending subdomain on each side contains domain-level locks. No competitor documents this split. Openstatus shows the risk: one subdomain carries both streams.
- **Confirm email channel recipients who are not verified org members.** UptimeRobot's "not activated" state and Hyperping's account-email-only model both stop operators from pointing alerts at arbitrary inboxes. Openstatus, Pingdom and StatusCake do not. A confirmation link for any address that isn't already a verified member closes the one path that sends mail to unconsented addresses with no cap.
- **Gate subscriber email on the hosted service.** Hyperping, UptimeRobot and Openstatus give free plans no subscribers, and Better Stack has the same rule for notifying them. While paid plans are paused, use a per-organization flag that staff turn on, in the spirit of Instatus reviewing the first confirmation bypass. Self-hosted instances use the operator's own provider and need no gate.
- **Add hard caps alongside the daily confirmation cap.** Market caps start at 100 to 200 on free tiers (Statuspage, Instatus, Hyperping Essentials). Add a total subscriber cap per page or org, a global confirmation ceiling across all pages, and per-IP plus per-address throttles (Cachet 6 per minute; UptimeRobot one resend per hour per address). Consider a CAPTCHA, as Statuspage does. Shorten the 48h link only if abuse appears; it already sits between UptimeRobot's 2 days and Cachet's 60 minutes.
- **Ship RFC 8058 one-click unsubscribe and bounce suppression on subscriber mail.** Add `List-Unsubscribe` and `List-Unsubscribe-Post` headers covered by DKIM, backed by a token POST endpoint. Openstatus built the endpoint but never sent the header, and that is the gap to avoid. Suppress addresses on hard bounce or complaint, as Statuspage's quarantine does, and keep bounce rates well under Scaleway's 7% alert line.
- **Do not let anyone skip double opt-in on the hosted service.** Atlassian removed its skip-confirmation flag and Instatus has staff review the first use. Operator imports and API adds should still send a confirmation email and stay inactive until the recipient clicks.
