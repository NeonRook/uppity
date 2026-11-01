# Changelog

## 0.10.0

### Minor Changes

- [#206](https://github.com/NeonRook/uppity/pull/206) [`d9bcb01`](https://github.com/NeonRook/uppity/commit/d9bcb01827021fe2bf8301944c809ee4caa7a876) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Self-hosted instances can now send traces, warnings and errors to any OpenTelemetry backend by setting `OTEL_EXPORTER_OTLP_ENDPOINT` on the web server and both workers. Nothing is sent unless you set it. Log exports leave out email addresses, IP addresses and customer text, but trace error details can include error messages.

  The notifier now logs a heartbeat every five minutes, so your backend can alert you if it stops. Keep `LOG_LEVEL` at `info` or lower for this to work.

  The Docker image now includes its production dependencies and is about 215 MB larger.

## 0.9.0

### Minor Changes

- [#183](https://github.com/NeonRook/uppity/pull/183) [`105dd9a`](https://github.com/NeonRook/uppity/commit/105dd9ac19af017a7b731000107706070fe55c2e) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Alerts that fail to deliver are now sent again instead of being lost. When a mail server, Slack, Discord or a webhook is down, times out or is overloaded, Uppity tries again after 1, 2, 5, 10, 20 and 30 minutes. Status page subscribers get the same retries. A clear refusal, such as a rejected address or a webhook answering 404, is not tried again. After a timeout, an alert can occasionally arrive twice.

  A late alert says it is late and shows the time it happened. If the monitor or incident has moved on since, its subject says so, for example "Delayed, now up", and webhooks do not receive it, so an automation never ends on an old state.

  A webhook that takes longer than 30 seconds to answer now counts as failed and is retried.

  An email channel whose address bounced or marked email as spam now says so on the notification channels page, because alerts to it are dropped.

  Self-hosted operators with ops alerts configured get a message within minutes when the mail server refuses the login or the sender, or stops answering, at most once per cooldown. Alert emails wait for about an hour, so fixing the password in that time delivers them. An ops alert sent by email goes through that same mail server, so set the Discord destination to hear about this. A customer's failing webhook sends no ops alert. Nothing to configure and no migration.

- [#186](https://github.com/NeonRook/uppity/pull/186) [`16cf003`](https://github.com/NeonRook/uppity/commit/16cf003630b5d177c4935b1832326fa5fe9aaeb2) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Status pages can now serve on your own domain, such as `status.example.com`. An owner or admin adds the domain in the page's settings, creates the CNAME and TXT records it shows, and the page goes live on that domain once DNS checks out. Keep both records in place: about three hours after either one is removed, the page leaves the domain, and owners and admins get an email and see the domain marked as lost in the settings. Putting the records back restores it. On hosted plans that include custom domains, HTTPS for a new domain is set up by hand, so it may take a while after the domain shows as active.

  Self-hosted operators need to do three things to use this. Pass the original `Host` header through your reverse proxy, get a certificate for each customer domain, and add each domain to your Turnstile widget if you use one. The custom domains guide in the repository has Caddy and Traefik examples. `UPPITY_STATUS_PAGE_CNAME_TARGET` sets where customers point their domain. With `SELF_HOSTED=true` it defaults to the host of `BETTER_AUTH_URL`, and without a public hostname there the feature stays hidden.

  Upgrade note: any domain already stored on a status page by hand was never verified, so it stops being used as the page's address. The page's settings show it as waiting for DNS until an owner or admin creates the records. Other hostnames keep reaching the app as before.

- [#179](https://github.com/NeonRook/uppity/pull/179) [`53f6ba5`](https://github.com/NeonRook/uppity/commit/53f6ba556e27de3dc071816ce890b7e4de445190) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Status page subscribers whose address hard-bounces or reports an email as spam stop receiving mail, and no later confirmation email reaches them if they subscribe again. Their subscriptions are deleted after 90 days (`UPPITY_SUPPRESSED_SUBSCRIBER_RETENTION_DAYS`, set on the monitor worker). An admin can look up an address under Suppressed addresses in the admin area and lift it, which also keeps its subscriptions.

  If you send through Resend, add a webhook for `email.bounced` and `email.complained` pointing at `/api/webhooks/resend`, and set its signing secret as `RESEND_WEBHOOK_SECRET` on the web server. Without the secret the endpoint refuses every request and mail behaves as before. Resend sends a webhook every event on the account, so instances sharing one Resend account suppress each other's addresses.

- [#179](https://github.com/NeonRook/uppity/pull/179) [`4b579a1`](https://github.com/NeonRook/uppity/commit/4b579a1e0a038f405e513eaff54872541d494505) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Hosted instances now limit email to addresses that never agreed to mail: channel confirmations, status page subscriber confirmations and team invitations. The whole instance sends at most 1,000 a day, of which status page subscriptions may use half, and past that sends are refused with a message saying so. An organization whose own channel confirmations and invitations draw too many hard bounces or spam complaints can't email new addresses until an admin clears it from the organization's page in the admin area. Addresses visitors type into a status page don't count against its organization. Alerts to confirmed addresses are never held back.

  Self-hosted instances keep working as before: the ceiling is off with `SELF_HOSTED=true`, and organizations are only blocked if a Resend webhook is set up. Set `UPPITY_UNSOLICITED_MAIL_DAILY_CEILING` to change or turn on the ceiling, and the `UPPITY_MAIL_*` variables in `.env.example` to change the thresholds. To hear about the ceiling and blocks, set `UPPITY_OPS_ALERT_EMAIL` or `UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL` on the web server as well as the notifier.

  With `docker-compose.yml`, `SELF_HOSTED` from your `.env` now reaches every container. It was ignored before, so if you set it, plan limits stop applying after this upgrade.

  Subscription confirmation links no longer contain the status page's address. Links already sent keep working. The upgrade only adds new tables.

- [#182](https://github.com/NeonRook/uppity/pull/182) [`57d02ed`](https://github.com/NeonRook/uppity/commit/57d02ed9bf21962922d7fbc89e06bc0371741692) Thanks [@lucasvienna](https://github.com/lucasvienna)! - On the hosted service, staff now turn on status page email subscriptions per organization. Organizations with confirmed subscribers when they upgrade keep them, keep their subscribe form and keep sending. Other organizations no longer show the form until staff turn it on, and confirmation links already sent to their visitors stop working. Alerts are not affected.

  Self-hosted instances need no action. Subscribe forms and subscriber email keep working for every organization, whether or not `SELF_HOSTED` is set.

- [#184](https://github.com/NeonRook/uppity/pull/184) [`5949091`](https://github.com/NeonRook/uppity/commit/5949091c2e3add4edd2a74b2f8d1aa5eb86851f4) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The register, password reset and status page subscribe forms can now run a Cloudflare Turnstile bot check. It is usually invisible to visitors, and status page visitors only load it once they start on the subscribe form.

  Self-hosted instances keep working with no setup. To turn it on, create a Turnstile widget for the host in `BETTER_AUTH_URL` and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` on the web server. Setting only one makes those forms refuse submissions and logs an error.

  With the check on, the subscribe form needs JavaScript. Those forms also refuse submissions while Cloudflare is unreachable, and unsetting both keys reopens them. Reading a status page and signing in never depend on Cloudflare. Cloudflare receives the IP address and browser details of visitors who use the forms, so name it in your privacy notice.

### Patch Changes

- [#180](https://github.com/NeonRook/uppity/pull/180) [`7ddbea2`](https://github.com/NeonRook/uppity/commit/7ddbea217dc2162fa9101615fa823f4c19d2e2ef) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Monitor alerts no longer show passwords or tokens from a monitor's URL. Slack, Discord, email and webhooks get the URL without its username, password and fragment, with query values and unusual query names shown as `***`. A secret written in the URL's host or path is still shown, so move it to a request header. A stored URL that is not http or https is left out of alerts, and webhooks send `monitor.url` as `null` for it. Because webhooks now get the masked value, a consumer that calls or matches that URL should use `monitor.id` instead.

  The API applies the same masking and returns `null` for a monitor URL that is not http or https.

  An automatically opened incident now starts with "Monitor is not responding." instead of the check's error text, which could show hostnames and ports on public status pages and in subscriber emails. The error stays in alerts and check history. A check that fails on an unsupported redirect no longer quotes the redirect target.

  The monitor form now requires an http or https URL. A monitor saved with any other URL fails every check, and its form asks for a working URL before the next save.

  Alerts and incident updates already sent still hold the original text, so change any credential you had in a monitor URL.

- [#181](https://github.com/NeonRook/uppity/pull/181) [`e43c13a`](https://github.com/NeonRook/uppity/commit/e43c13a89916a3a51478f4931a4becf3439afa10) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Clicking "Ask again" too soon after an address unsubscribes now tells you the time you can ask again.

- [#181](https://github.com/NeonRook/uppity/pull/181) [`9722a46`](https://github.com/NeonRook/uppity/commit/9722a467fe790be4c9897e5563cd6ed5fb9575ac) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Saving an email channel no longer waits for the confirmation email to send. The notification worker sends it now, so self-hosted operators need that worker running for confirmation emails to go out, as they already do for alerts. If the email can't be sent, the channel list shows "Email not sent" and you can resend it right away. "Resend confirmation" and "Ask again" still send right away.

- [#185](https://github.com/NeonRook/uppity/pull/185) [`706628c`](https://github.com/NeonRook/uppity/commit/706628c9f454116fda15abf085e9d927e3b26998) Thanks [@lucasvienna](https://github.com/lucasvienna)! - A monitor that keeps going down and recovering no longer sends an alert for every change. Once a monitor has sent 4 up and down alerts in an hour, its next outage sends one "flapping" message instead, with a reminder every hour while it lasts. Up, down and degraded alerts then wait until the monitor stays down for 5 minutes or goes 5 minutes without going down, and you get one alert for its status.

  A real outage is still reported: a flapping monitor that stays down alerts within 5 minutes plus one check interval of its first failure, or at its "alert after failures" setting if that takes longer. A flapping monitor that recovers sends one recovery alert after the same 5 minutes. A monitor that keeps switching between down and degraded stays on hold, with the hourly reminder and an open incident, until it does one or the other.

  The monitor page explains when a monitor is flapping. Status, check history, uptime and public status pages stay live throughout. An automatic incident stays open with the title "<monitor> is flapping" until the monitor settles, instead of one incident per bounce.

  Webhooks get a new `monitor_flapping` event type. Webhook consumers that act on `monitor_down` and `monitor_up` receive neither while a monitor flaps.

  Self-hosted operators can change this on the monitor worker with `UPPITY_FLAP_THRESHOLD`, `UPPITY_FLAP_WINDOW_SECONDS` and `UPPITY_FLAP_SETTLE_SECONDS`. A threshold of 0 or 1 turns it off, and a value outside the range in `.env.example` uses the default. A longer settle time delays the alert for an outage that follows flapping.

- [#174](https://github.com/NeonRook/uppity/pull/174) [`5a6185e`](https://github.com/NeonRook/uppity/commit/5a6185ef8ca7a00411e755db86c17ddf26dd8359) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Logs now report the running release instead of `0.0.1`. Checks of a down target log at info level with `status="success"`, keeping the outcome in `check_status` and `check_error`, and `status="error"` now means the worker itself failed. If you alert on `status="error"` to catch down checks, switch to `check_status="down"`.

- [#178](https://github.com/NeonRook/uppity/pull/178) [`f1432df`](https://github.com/NeonRook/uppity/commit/f1432df65685e9d8c232bbcf1e69624654c36366) Thanks [@lucasvienna](https://github.com/lucasvienna)! - A monitor with an invalid saved URL now shows as down with the error "URL is not valid" and alerts like any other outage.

- [#189](https://github.com/NeonRook/uppity/pull/189) [`6bf5056`](https://github.com/NeonRook/uppity/commit/6bf50567d1e8ccdf2e8e536fd3ca288ea3441360) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The landing page now shows the correct competitor prices for SAML SSO, audit logs and private status pages.

- [#185](https://github.com/NeonRook/uppity/pull/185) [`951d8b1`](https://github.com/NeonRook/uppity/commit/951d8b1369313ef92e89805108729b3933569c2d) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Lowering a monitor's "alert after failures" setting during an outage now alerts on the next failed check. Before, an outage that had already passed the new setting stayed silent until it ended.

- [#181](https://github.com/NeonRook/uppity/pull/181) [`bbde571`](https://github.com/NeonRook/uppity/commit/bbde5711e67c03f51fd540eeb5cc3038978e6a2e) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Uppity now gives up on a mail server that stops answering: after 30 seconds when connecting, or 60 seconds of silence once connected, instead of 2 and 10 minutes. Self-hosted operators with a relay that stays silent for longer will see those sends fail, and alert emails are tried again later.

- [#172](https://github.com/NeonRook/uppity/pull/172) [`68f222e`](https://github.com/NeonRook/uppity/commit/68f222e3a95a4ce9678acf3c7cedc6f19091aecf) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Security updates to the HTTP client behind checks and webhook deliveries, and to the web framework. The database driver moves to a new major version: on TLS connections it now binds the login to the server certificate when the server offers it. No configuration changes are needed.

- [#176](https://github.com/NeonRook/uppity/pull/176) [`9149ec2`](https://github.com/NeonRook/uppity/commit/9149ec282c51c9226b7654002b1396312e76f2b7) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Self-hosted operators can now be told when monitors stop being checked on their instance. Set `UPPITY_OPS_ALERT_EMAIL`, `UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL`, or both on the notifier worker to get an alert when checks are overdue, when monitors are dead-lettered, or when the database cannot be read. The same alert repeats every 6 hours while its cause lasts; change that with `UPPITY_OPS_ALERT_COOLDOWN_HOURS`. A new outage after a recovery alerts straight away. Alerts name monitors and organizations by ID only, and the admin page has the details. Email needs the SMTP settings, and a webhook on a private address needs `UPPITY_ALLOW_PRIVATE_TARGETS`. With neither destination set, nothing changes. The upgrade adds one small table and locks nothing that exists.

- [#177](https://github.com/NeonRook/uppity/pull/177) [`b7753f3`](https://github.com/NeonRook/uppity/commit/b7753f3d9bb5ec1b76fd32b076bcb72c93f6a58d) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Password reset emails now say the link expires in 1 hour, in both the HTML and plain-text versions.

- [#181](https://github.com/NeonRook/uppity/pull/181) [`f191c7e`](https://github.com/NeonRook/uppity/commit/f191c7e0438f16b82dc9310ab1b41a8c4b73d54d) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The monitor form and monitor page now show an unsubscribed email channel as "Unsubscribed", matching the channel list, instead of "Unconfirmed".

- [#178](https://github.com/NeonRook/uppity/pull/178) [`efb377f`](https://github.com/NeonRook/uppity/commit/efb377f19c4705cdd5ed76e82c442ce47818b4b7) Thanks [@lucasvienna](https://github.com/lucasvienna)! - An incident with a postmortem now counts as ended: it moves to the resolved history on status pages, the next outage on its monitor opens a new incident, and its postmortem stays editable. The API reference lists `postmortem` as an incident status.

- [#177](https://github.com/NeonRook/uppity/pull/177) [`156a0c3`](https://github.com/NeonRook/uppity/commit/156a0c3376410eb78fa162a1debc572c01acd89f) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Alert emails and Discord messages now show a readable time with its zone, such as `10 Oct 2026, 18:34 UTC`, instead of a raw timestamp. Webhook payloads keep ISO 8601.

- [#185](https://github.com/NeonRook/uppity/pull/185) [`3da3330`](https://github.com/NeonRook/uppity/commit/3da333055eaa84a23f47a83196ff7d7b51503c71) Thanks [@lucasvienna](https://github.com/lucasvienna)! - A monitor that recovers through a slow patch now sends its recovery alert. Before, going from down to degraded to up sent no recovery alert and left the automatic incident open on the status page until the next outage ended.

  The recovery alert goes out on the first up check. The automatic incident closes then too, or sooner if the monitor stays degraded for 5 minutes, because it is responding again.

- [#175](https://github.com/NeonRook/uppity/pull/175) [`995bb4e`](https://github.com/NeonRook/uppity/commit/995bb4ef4359ec16c7a3b6ad546016da40925fa7) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Team invitations now reach the person you invite. They get an email with a link to accept or decline, and anyone with a pending invitation sees it on their dashboard. Accepting needs a verified email address that matches the invitation, and only members with a verified address can invite. Recipients can unsubscribe from a team's invitations, and an invitation stops working if the person who sent it leaves the organization.

  Self-hosted operators: invitations need SMTP. Without it, inviting now fails with a clear message instead of reporting success. Invitation emails go through the subscriber mail server when one is set, and count toward `UPPITY_CHANNEL_PENDING_CONFIRMATIONS` together with alert confirmations.

- [#177](https://github.com/NeonRook/uppity/pull/177) [`5454d44`](https://github.com/NeonRook/uppity/commit/5454d4453348e9a0660ac63b967b3c85875edead) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Uptime bars on status pages no longer label each day one day early for visitors west of UTC.

## 0.8.0

### Minor Changes

- [#166](https://github.com/NeonRook/uppity/pull/166) [`d7cb9ee`](https://github.com/NeonRook/uppity/commit/d7cb9ee7d48c68fb603bcd782b902b75e23d2cdf) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Monitors report more, and push monitors recover properly.

  - A push monitor that comes back after an outage now sends its "up" notification and resolves the incident that was opened for it. Heartbeats received during a maintenance window no longer change the monitor's status.
  - Each HTTP check now shows how long DNS, connecting, TLS and the first byte took, and how many redirects it followed.
  - HTTP monitors have two new settings: "Follow redirects" (on by default; off reports the redirect itself, such as a 301) and "Accept self-signed certificate" (off by default; on still checks the host name and expiry).
  - Failed checks say what failed, such as the DNS lookup, a refused connection, an expired or untrusted certificate, or a timeout and the step it happened in, instead of "fetch failed". Failed Slack, Discord and webhook notifications say the same.
  - "Response body contains" accepts up to 1024 characters and matches within the first 1 MiB of the response.

- [`d6435eb`](https://github.com/NeonRook/uppity/commit/d6435eb216e6003809560eeea4db43025c6717a2) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Self-hosted: the image now runs on Node instead of Deno. The image keeps its name and its commands, and needs no new environment variables.

  - `ORIGIN` works as before, including plain `http://` addresses. The server no longer falls back to the origin of `BETTER_AUTH_URL` when `ORIGIN` is unset: it assumes https and the request's `Host` header. If you serve plain HTTP and never set `ORIGIN`, set it now. Behind a proxy that rewrites `Host`, you can set `HOST_HEADER=x-forwarded-host` instead of `ORIGIN`.
  - The web server and migrations still cannot write files, start other programs or load native code. They can now connect to any network address, where before only the database, mail servers and billing API were allowed.
  - The image is about 57MB larger on disk and 8MB larger to download.
  - One "ExperimentalWarning" line about `--allow-net` appears in the web server's log at startup. It is expected.

- [#166](https://github.com/NeonRook/uppity/pull/166) [`d7cb9ee`](https://github.com/NeonRook/uppity/commit/d7cb9ee7d48c68fb603bcd782b902b75e23d2cdf) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Self-hosted: checks and notifications no longer reach private addresses by default.

  - HTTP and TCP checks, and Slack, Discord and webhook notifications, now refuse hosts on private, loopback, link-local and similar internal addresses, including your cloud provider's metadata service. A monitor pointed at one fails with "Blocked: … private address". If your instance monitors services on its own network, set `UPPITY_ALLOW_PRIVATE_TARGETS=true` on the monitor and notifier workers. Leave it unset where people you do not trust can create monitors.
  - To trust a private certificate authority in checks, set `NODE_EXTRA_CA_CERTS` to the path of its PEM file inside the container.
  - `UPPITY_SSL_INFO_TIMEOUT_MS` is gone. Certificates are now read during the check itself, within the monitor's timeout.
  - The upgrade's migration reads the check history once to build an index. Saving new check results waits until it finishes.

### Patch Changes

- [#168](https://github.com/NeonRook/uppity/pull/168) [`aa366a7`](https://github.com/NeonRook/uppity/commit/aa366a780eb2548b652e6367a907547e1a288c6f) Thanks [@lucasvienna](https://github.com/lucasvienna)! - When a webhook, Slack or Discord endpoint rejects an alert, the recorded error keeps the status code and the first 512 bytes of the response instead of the whole response.

- [#163](https://github.com/NeonRook/uppity/pull/163) [`f330e59`](https://github.com/NeonRook/uppity/commit/f330e599a5f53d9258d2b2a25fbee48806f4ae4e) Thanks [@lucasvienna](https://github.com/lucasvienna)! - A monitor's timeout is now at most 60 seconds and its retries at most 10. Settings above that are lowered to the limit on upgrade.

## 0.7.0

### Minor Changes

- [`8498189`](https://github.com/NeonRook/uppity/commit/84981897f89656f92be005ed54cff3a51c618e16) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Email alert channels now ask the recipient before sending alerts. An address that isn't a verified member of your organization gets a confirmation link and receives no alerts until it is confirmed. The channel list shows which addresses are still unconfirmed and can resend the link. Every alert email now has an unsubscribe link. When an address unsubscribes, your organization's owners and admins get an email, and you can ask that address to confirm once more.

  Confirmation emails, including those for status page subscriptions, no longer contain the organization or status page name. The confirmation page shows it instead.

  Existing email channels keep receiving alerts with no action needed. Self-hosted: confirmation emails go through the subscriber mail server when one is configured, and `UPPITY_CHANNEL_PENDING_CONFIRMATIONS` (default 5) sets how many addresses one organization may leave unconfirmed within a week.

- [#162](https://github.com/NeonRook/uppity/pull/162) [`0033fb0`](https://github.com/NeonRook/uppity/commit/0033fb0b020d3b92b7836ff6a2867173337d29b6) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Monitor pages now chart daily response time, average and 95th percentile, over the last 30, 60 or 90 days. Days with degraded or failed checks are shaded. The longer ranges appear only on plans that keep check history that long.

  HTTP checks now open a new connection every time, as a first-time visitor would, so response times can read somewhat higher than before the upgrade.

  Self-hosted: the upgrade migration fills in the 95th percentile and degraded counts for past days from the check history you still keep, which reads that history once. Days older than that show no 95th percentile and no degraded shading.

- [`99ca3cd`](https://github.com/NeonRook/uppity/commit/99ca3cd051e2d4ae16e8aae5369bdb81c17e8980) Thanks [@lucasvienna](https://github.com/lucasvienna)! - New accounts get a link to verify their email address, and a banner reminds you until it's verified. Once verified, adding your own address as an email channel works straight away, with no confirmation email. Until then, email channels can only send to your own address.

  Accepting a team invitation now needs a verified email address, and resetting your password signs out every other session.

  Existing accounts see the banner on their next visit and keep everything they have. Self-hosted instances without SMTP show no banner, and their accounts can't accept invitations until an admin configures SMTP.

### Patch Changes

- [#162](https://github.com/NeonRook/uppity/pull/162) [`0262e97`](https://github.com/NeonRook/uppity/commit/0262e97460298c90967240ed2a4fbc2df1602f08) Thanks [@lucasvienna](https://github.com/lucasvienna)! - A slow or unreachable endpoint no longer delays checks on other monitors. Each check now frees its slot the moment it finishes, so a check that waits out its full timeout holds back only itself, not the rest of the batch.

  Self-hosted: `UPPITY_WORKER_BATCH_SIZE` now sets how many checks one monitor worker runs at once. The default stays at 10.

- [#161](https://github.com/NeonRook/uppity/pull/161) [`cda8037`](https://github.com/NeonRook/uppity/commit/cda80379652e1116e45529462036b4e397c86cfb) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Links in alert emails and status page subscriber emails work again on uppity.cloud. They pointed at localhost, so their unsubscribe and incident links went nowhere.

## 0.6.0

### Minor Changes

- [#141](https://github.com/NeonRook/uppity/pull/141) [`c81210f`](https://github.com/NeonRook/uppity/commit/c81210f0629f3ea1463408dd22f377be6ac11ddc) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Organizations above their monitor limit now get 14 days before anything changes. Owners and admins are emailed when the organization goes over, with 7 days left, and with 1 day left, and the app shows a banner with the date. If the organization is still over its limit after that, Uppity pauses its newest monitors until it is back within the limit. Nothing is deleted. Paused monitors resume when you add capacity, or you can resume them yourself once there is room.

  Self-hosted instances have no monitor limit and are unaffected.

- [#141](https://github.com/NeonRook/uppity/pull/141) [`70b3ff2`](https://github.com/NeonRook/uppity/commit/70b3ff2b18a57b0fe3c2af33ed4536ab44897cf1) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Paused monitors no longer count toward your monitor limit. Pause monitors you don't need running to make room, without adding capacity. Resuming a monitor needs a free slot, the same as creating one.

- [#146](https://github.com/NeonRook/uppity/pull/146) [`995593e`](https://github.com/NeonRook/uppity/commit/995593e25b29ed86ed1dcea439871b3ad7c69930) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Read your monitors, their check history, and your incidents over a REST API. Create keys under Settings → API keys; owners and admins manage them, and every plan can read. Each key can make 60 requests on Free or 600 on paid plans before it has to pause, and the count resets once the key has gone a full minute without an accepted request. The reference is at `/api/openapi.json`.

  Self-hosted operators set the per-key figure with `UPPITY_API_REQUESTS_PER_MINUTE` (default 600). Upgrading adds one database table for API keys.

- [#149](https://github.com/NeonRook/uppity/pull/149) [`058a5c8`](https://github.com/NeonRook/uppity/commit/058a5c8e1b3a91a643f8efa4083ad4611bce7d63) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Read your status pages over the API, including private ones, with each component's current status. Every public status page also has a summary endpoint that needs no key and can be called from any website, so you can show your status inside your own app or build a custom status page. A private page's summary returns not found.

- [`cd5d228`](https://github.com/NeonRook/uppity/commit/cd5d22810ae1a3cdcaa76b28f463d276c84777c0) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Visitors can subscribe to a public status page by email, and get an email whenever an incident shown on it starts, changes, or is resolved. They confirm through a link that works for 48 hours, and every email they receive lets them unsubscribe. Addresses that are never confirmed are deleted.

  Each status page sends a limited number of confirmation emails a day, so nobody can use the form to flood strangers' inboxes. The limit is 50, or a quarter of the page's confirmed subscribers when that is more, up to 300. Self-hosted operators can change these with `UPPITY_SUBSCRIBER_CONFIRMATIONS_BASE`, `UPPITY_SUBSCRIBER_CONFIRMATIONS_PERCENT` and `UPPITY_SUBSCRIBER_CONFIRMATIONS_MAX`.

### Patch Changes

- [#140](https://github.com/NeonRook/uppity/pull/140) [`91b4846`](https://github.com/NeonRook/uppity/commit/91b48462f519e6b1d2638087809568d303c22b31) Thanks [@lucasvienna](https://github.com/lucasvienna)! - When Uppity stops running checks altogether, monitors now show "Not checked" in the app and on public status pages within five minutes, instead of their last status. Before, a stopped checker left every status page showing the last result as current.

  Self-hosted operators: the notification worker logs `monitor_checks_overdue` every five minutes while any monitor goes unchecked. Point a log alert at it.

- [#137](https://github.com/NeonRook/uppity/pull/137) [`62a2aa3`](https://github.com/NeonRook/uppity/commit/62a2aa3481f006c68739fe197e4dd7372ce72345) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Sign-in, sign-up and password reset rate limits now apply per client behind a reverse proxy. Before, every visitor shared one limit, so a single person could lock everyone out. The audit log now records the visitor's address instead of the proxy's.

  Self-hosted behind a proxy? Set `CLIENT_IP_HEADER` to the header your proxy overwrites with the client address, such as `x-real-ip`. Only set it if the proxy replaces the header on every request; otherwise visitors can choose their own address.

- [#148](https://github.com/NeonRook/uppity/pull/148) [`3994920`](https://github.com/NeonRook/uppity/commit/3994920d6c46617b1c95d0005f0f4dea1da74d00) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The homepage no longer lists paid plans or hosted prices. It offers the free hosted plan and self-hosting.

- [#156](https://github.com/NeonRook/uppity/pull/156) [`40bb8d2`](https://github.com/NeonRook/uppity/commit/40bb8d223bc6ac970da6ade84c10e1a1f16edd5c) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Deleting a monitor, incident, notification channel or status page from its list removes it right away. So does pausing or resuming a monitor or channel from the list. These actions had stopped updating the list: most pages showed a loading error until reload, and the incidents list kept showing the deleted incident.

  When one of these actions, or removing a team member, cancelling an invitation or deleting an organization, is refused, the message now says why instead of a generic error. If a page fails to load, it offers a retry and the rest of the app stays usable.

- [#139](https://github.com/NeonRook/uppity/pull/139) [`25cc3d7`](https://github.com/NeonRook/uppity/commit/25cc3d7faa90a127b9ab1333d94be139a32e7c26) Thanks [@lucasvienna](https://github.com/lucasvienna)! - A background task that fails now retries within 15 minutes instead of on every pass, and a failed usage report to billing is logged as a failure rather than a success.

- [#150](https://github.com/NeonRook/uppity/pull/150) [`35be24c`](https://github.com/NeonRook/uppity/commit/35be24c1ffb29fd2ad2f44b737e14d25a6ddb415) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The monitoring worker no longer shuts down for good when it starts while an upgrade's database migration is still running. It keeps checking monitors and finishes its startup once the migration lands, so an upgrade no longer needs a manual restart of the worker to resume monitoring.

- [#147](https://github.com/NeonRook/uppity/pull/147) [`d31e831`](https://github.com/NeonRook/uppity/commit/d31e83195b932a19ced1256c58d3ee93a5829ad3) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Upgrading to a paid plan is paused on the hosted service. Every organization stays on the free plan, and the billing page says paid plans are coming. Existing subscribers can still manage their subscription and capacity.

- [`84c8332`](https://github.com/NeonRook/uppity/commit/84c83329879795e7b0192e17b52cf2dffbe8f347) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Self-hosted operators can send status page subscriber mail through a separate SMTP account with `SUBSCRIBER_SMTP_HOST`, `SUBSCRIBER_SMTP_PORT`, `SUBSCRIBER_SMTP_USER`, `SUBSCRIBER_SMTP_PASSWORD` and `SUBSCRIBER_SMTP_FROM`. Anyone can enter a subscriber address, so bounces from those addresses can get a sending account suspended. A separate account keeps that from stopping your alerts. Leave these unset and subscriber mail goes through your existing SMTP settings, so you don't need to change anything when you upgrade.

- [#151](https://github.com/NeonRook/uppity/pull/151) [`1fcffd5`](https://github.com/NeonRook/uppity/commit/1fcffd5456f3110379505290e8a4c3bbf76e5d94) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Self-hosted instances whose PostgreSQL server runs in a timezone other than UTC recorded some times shifted by that offset. Incident update times and audit log entries showed the wrong time, checks during maintenance could count against uptime, and a new push monitor could report a missing heartbeat hours early or late. Separately, when the app itself ran outside UTC, the oldest day of a status page's uptime history could count only part of that day. Neither timezone matters any more. Times recorded before the upgrade keep their offset.

  The upgrade migration locks the check history while it rebuilds its indexes, about one second per million stored checks. Checks wait for it to finish.

## 0.5.0

### Minor Changes

- [#135](https://github.com/NeonRook/uppity/pull/135) [`94e8e35`](https://github.com/NeonRook/uppity/commit/94e8e35bf278de8b4fb34179ba4c7ffbe8a7e667) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Monitors can now alert your notification channels. Until now there was no way to attach a channel, so no alerts were sent.

  - New monitors start with every enabled channel attached. On the monitor form you can detach channels and choose which events each one hears: down, recovered, degraded, and certificate expiry for HTTP monitors with the SSL check on.
  - A monitor's page lists where its alerts go, and warns when nobody will hear it go down.
  - A channel's page lists the monitors that alert it, so you can attach or detach many at once.

### Patch Changes

- [#136](https://github.com/NeonRook/uppity/pull/136) [`497c5d5`](https://github.com/NeonRook/uppity/commit/497c5d5b48541cb8d8ad551726b6ecec8acf041c) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Down alerts now always reach your channels. A monitor set to alert after more than one failure, or one that was down from its very first check, used to stay silent for the whole outage. A monitor's second outage now opens its own incident too.

- [#132](https://github.com/NeonRook/uppity/pull/132) [`d81b9a9`](https://github.com/NeonRook/uppity/commit/d81b9a9b3a5531cda23c66f7b4efe7eb6120c8fa) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Email notification channels now deliver. Self-hosters on the published `docker-compose.yml` should pull the new file; if you run the notifier another way, give it the same `SMTP_*` variables as the app.

  Uppity now refuses to send SMTP credentials over a connection without TLS. Set `SMTP_FROM` to an address on your own domain; the fallback sender is now `noreply@uppity.cloud`.

- [#134](https://github.com/NeonRook/uppity/pull/134) [`b2c2849`](https://github.com/NeonRook/uppity/commit/b2c28490cabe737b63bfaf03d1a00d88b2c74ca9) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The published image can now reach your SMTP server. Before, it blocked the connection, so password reset and email alerts failed with `getaddrinfo EPERM`.

## 0.4.0

### Minor Changes

- [#125](https://github.com/NeonRook/uppity/pull/125) [`411d90d`](https://github.com/NeonRook/uppity/commit/411d90d196a77f3294ec256fcd4abd18eeb0e272) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Uppity plan customers can add monitor capacity from Billing settings, in blocks of 50 monitors at $8 a month or $80 a year, up to 40 blocks. Removing blocks takes effect at the end of the billing period, since each period is billed at the most blocks held during it. Annual customers confirm an increase before it applies, with the amount they'll pay at renewal. Owners and admins can change capacity; other members see it read-only.

- [#131](https://github.com/NeonRook/uppity/pull/131) [`741fcd6`](https://github.com/NeonRook/uppity/commit/741fcd679cf46891a1fb5e97fc0436be6cf0b62f) Thanks [@lucasvienna](https://github.com/lucasvienna)! - A monitor that Uppity itself repeatedly fails to check no longer goes quiet. Before, three failed attempts stopped its checks for 24 hours while the dashboard and the public status page kept showing its last status. It now keeps retrying every few minutes. Until a check succeeds, the dashboard and monitor pages show it as "Not checked" with the time of the next attempt, and the public status page shows it with no status and replaces "All systems operational" with "Some systems are not being monitored right now". The monitor's notification channels hear when checks stop and again when they resume. Webhooks receive these as `monitor_checks_stopped` and `monitor_checks_resumed`, and `monitor_checks_stopped` leaves `status` empty because the last recorded one is out of date.

  A check cut short by a worker restart or crash is now retried within about a minute, where it used to wait an hour. A notification that hits a database error while being sent is retried a few minutes later instead of being dropped.

  For operators, the admin area lists these monitors across organizations and can retry one immediately. Each one also logs an error with `event_type` set to `monitor_dead_lettered`, which a log alert can match. `UPPITY_DEAD_LETTER_HOURS` is no longer read and can be removed; `UPPITY_CHECK_BACKOFF_MAX_MS` (5 minutes by default) now sets how often these monitors retry. Upgrading runs a quick migration, and monitors currently held back by the old 24-hour rule are checked right away.

### Patch Changes

- [#127](https://github.com/NeonRook/uppity/pull/127) [`50c9696`](https://github.com/NeonRook/uppity/commit/50c969661bea5dbf7b065b8beb2af3b1d12d46b0) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Fixes a security issue in the admin area. Any signed-in account could read its data, including every user's email address, the organization list and the audit log. It could also use the admin forms, including changing another user's email address, editing organizations and their members, and resyncing subscriptions. The admin area now requires an admin account for every request. Operators should review the audit log for admin changes made by accounts that are not admins.

- [#124](https://github.com/NeonRook/uppity/pull/124) [`99498ed`](https://github.com/NeonRook/uppity/commit/99498eddfd046959eaa1d106aa6e189338f0d16e) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Groundwork for buying extra monitor capacity. Nothing changes for customers yet. Upgrading runs a short database migration on the subscription table.

- [#121](https://github.com/NeonRook/uppity/pull/121) [`41777ea`](https://github.com/NeonRook/uppity/commit/41777ea341ba37fcc7ad5c7066b56d397ae10988) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Groundwork for buying extra monitor capacity. Nothing changes for customers yet. Upgrading runs a short database migration on the subscription table.

- [#126](https://github.com/NeonRook/uppity/pull/126) [`f0b9939`](https://github.com/NeonRook/uppity/commit/f0b9939c5be37df06618c4b29cfe47c01844c6cf) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Security: fixed a flaw that let any signed-in user start a checkout for an organization they did not belong to. The resulting subscription could replace that organization's billing, and cancelling it could move the organization to Free while its real subscription kept being charged. Only owners and admins of an organization can now start a checkout or view its subscriptions, and subscription events from Polar change an organization only when they concern the subscription it is billed through.

  Instances running with Polar billing should check that every paid organization is billed to one of its own owners or admins. This release stops new mismatches but does not repair existing ones. Self-hosted instances without Polar billing were not affected.

- [#130](https://github.com/NeonRook/uppity/pull/130) [`71a8091`](https://github.com/NeonRook/uppity/commit/71a8091a01a84cb62b3a0f602124d7f276c15763) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Security: fixed flaws that let any signed-in user change another organization's incidents and status pages. An attacker could post updates to someone else's incident, which could resolve it and send that organization's notifications. They could rewrite any postmortem shown on a public status page, and add or remove monitors and groups on another organization's status page. By linking another organization's monitors to their own incidents and status pages, they could make a public status page show an outage that wasn't real, or show another organization's incidents, including ones never meant to be public. Incident and status page changes now apply only within your own organization, and public status pages no longer send internal page details to visitors.

  Status pages and notifications now ignore links between organizations, including ones that already exist, so nothing leaks after upgrading. Operators should still remove such links: status page monitors and incident monitors that join two organizations, and incident updates written by someone outside the incident's organization. The pull request linked from this entry has read-only queries that find them.

- [#128](https://github.com/NeonRook/uppity/pull/128) [`ec24651`](https://github.com/NeonRook/uppity/commit/ec246510fb79d8574de1411c0f72d5a4f6c57cc4) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Public status pages now show correct uptime for monitors with more than one day of history; the figure was wrong before. An incident affecting several monitors on the same page no longer lists each update more than once.

- [#129](https://github.com/NeonRook/uppity/pull/129) [`e3411c6`](https://github.com/NeonRook/uppity/commit/e3411c603a3b3585234bce16b2915fe9e7c7c978) Thanks [@lucasvienna](https://github.com/lucasvienna)! - HTTP monitors can use the OPTIONS method, which the method picker offered but saving rejected.

  The HTTP check timeout now also covers reading the response body. A monitor that checks the body for expected text now reports down when the body takes longer than its timeout to arrive, where before the check could wait indefinitely.

  Alert messages read the same across Discord, Slack and email, and every channel now shows when the event happened. Long titles and values are shortened to fit Slack's and Discord's limits instead of failing to send. The notification worker lets sends in progress finish before shutting down, so a redeploy no longer risks sending the same alert twice.

  Confirmation and error messages in the app now appear; they were silently dropped before. Monitor uptime shows two decimals and is rounded down, so any downtime keeps it below 100%. Incident update times on public status pages show correctly for viewers outside UTC.

  In the admin area, user pages load for every user, not only the first thousand, and role and plan selections are submitted once. Organization slugs created from settings drop punctuation instead of turning it into hyphens, as slugs elsewhere already did.

  Two unused endpoints are removed: the monitor dead-letter reset JSON endpoint and the monitor live-updates stream. Nothing in Uppity called either.

  Upgrading runs a migration that drops an unused table. The `UPPITY_DEFAULT_LIST_LIMIT`, `UPPITY_QUEUE_POLL_INTERVAL_MS` and `UPPITY_WORKER_POLL_INTERVAL_MS` variables were never read and are no longer documented; it is safe to remove them.

## 0.3.3

### Patch Changes

- [#119](https://github.com/NeonRook/uppity/pull/119) [`4f4ff09`](https://github.com/NeonRook/uppity/commit/4f4ff094ab8eb717ce5fe18c8f475a1c87224135) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Building from source now uses pnpm instead of aube. `mise install` provides it. The published image does not change.

## 0.3.2

### Patch Changes

- [`66c337a`](https://github.com/NeonRook/uppity/commit/66c337a07ee392ec1640eea1ee530fd954d533a7) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Building the image no longer takes a `VITE_BETTER_AUTH_URL` build argument, and the app no longer reads that variable. You can remove it from your build command and environment. `BETTER_AUTH_URL` is unchanged.

## 0.3.1

### Patch Changes

- [`ce9808d`](https://github.com/NeonRook/uppity/commit/ce9808d611452d9e62ffa3e81288e61cda130629) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The account issuer column added in the last release is gone again. The auth library that required it withdrew the requirement in its 1.7.3 release, and this upgrade drops the column and its index. The migration is quick and does not touch any other table.

- [#107](https://github.com/NeonRook/uppity/pull/107) [`011299b`](https://github.com/NeonRook/uppity/commit/011299b6a24b56fe0225680c5484fb144373d0d8) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The billing page shows the new plan as soon as you return from checkout. It no longer needs a manual reload to catch up.

- [#106](https://github.com/NeonRook/uppity/pull/106) [`aa58479`](https://github.com/NeonRook/uppity/commit/aa584797b442ebe7a6542e6226605ff5f1917895) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Groundwork for capacity blocks. Nothing changes in this release — blocks still cannot be bought.

- [`e83e3ec`](https://github.com/NeonRook/uppity/commit/e83e3ec70e1e28c6eca8197263872302aa755afe) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Building the image from source works again. aube, the package manager the build uses, moved to a new repository, and the build now fetches it from there.

## 0.3.0

### Minor Changes

- [#94](https://github.com/NeonRook/uppity/pull/94) [`3bfe414`](https://github.com/NeonRook/uppity/commit/3bfe4145f12ac422f5e8cb8ddf4a3d4f911cbadd) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The container now runs on Deno instead of Bun.

  If you run Uppity behind a reverse proxy that terminates TLS, check that `BETTER_AUTH_URL` is set to the public URL your users visit before upgrading. The previous runtime assumed HTTPS on its own; the new one takes the public URL from `BETTER_AUTH_URL`, or from `ORIGIN` if you prefer to set it separately. With neither, the server believes it is reachable at its internal address, and every form submission — including login — is rejected as cross-site. Nothing to do if Uppity is reachable directly, or if you already set `BETTER_AUTH_URL`, which the published `docker-compose.yml` does.

  If you override the container command to run the monitor or notifier workers, or you run migrations as a separate pre-deploy step, update those commands: `bun run ./build/worker-monitor.js` becomes `./entrypoint.sh worker-monitor`, and the same shape applies to the notifier and the migration step. The bundled web server is now started with `./entrypoint.sh serve`. The published `docker-compose.yml` and the Railway configs are already updated.

  The image grows from 165MB to 179MB, which is the cost of the move and was expected.

- [#99](https://github.com/NeonRook/uppity/pull/99) [`6542f2e`](https://github.com/NeonRook/uppity/commit/6542f2efde4628594dd29bbc809224540ba1ab28) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Container processes now start with only the access they need, instead of full access to the machine. The web server can reach your database, your mail server and the billing API, and nothing else on the network. It cannot write files, start subprocesses or load native code. Both workers keep unrestricted outbound network access, because checking monitors and delivering webhooks means connecting to whatever address you configure, but they give up everything else.

  The point of this is the web tier. Uppity's job is fetching addresses your users supply, so a flaw that tricks the server into fetching an address it should not is the failure worth guarding against. A request like that now fails at the runtime, before it reaches the network.

  Nothing new to configure. The list of permitted hosts is assembled when the container starts, from `DATABASE_URL`, `SMTP_HOST` and `SMTP_PORT`. If you later point Uppity at a service it did not previously contact, the connection is refused and the log names the host that was wanted.

  If you override the container command, to run one of the workers or to run migrations as a separate pre-deploy step, update it: `deno run -A ./build/worker-monitor.js` becomes `./entrypoint.sh worker-monitor`, and the same shape applies to the notifier (`worker-notifier`), the migration step (`migrate`) and the web server (`serve`). The published `docker-compose.yml` is already updated. Commands that invoke the bundles directly still work, but they run without any of the restrictions above.

### Patch Changes

- [#96](https://github.com/NeonRook/uppity/pull/96) [`a417341`](https://github.com/NeonRook/uppity/commit/a417341c21478751cfe979ac2e2cd89baf816c88) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Building the image from source no longer downloads every dependency twice; the dependency layer now caches the way the Dockerfile always intended.

- [#100](https://github.com/NeonRook/uppity/pull/100) [`5b7390c`](https://github.com/NeonRook/uppity/commit/5b7390c9aba89ab9880af9b47aaf0de53d6368e6) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The hosted service now applies pending database migrations as part of each deploy, before the new version takes traffic. Self-hosted installs already did this, through the published `docker-compose.yml`.

## 0.2.1

### Patch Changes

- [#92](https://github.com/NeonRook/uppity/pull/92) [`0ba0e94`](https://github.com/NeonRook/uppity/commit/0ba0e9438dff6f3868cc752b2ec6b9e3cd7c07dd) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Fixed uptime bands on status pages shifting by a day on instances running in a non-UTC timezone. A day on the band chart has always meant a UTC day, and it now stays one no matter what clock the host is set to. Instances left on UTC were never affected.

## 0.2.0

### Minor Changes

- [#80](https://github.com/NeonRook/uppity/pull/80) [`81be763`](https://github.com/NeonRook/uppity/commit/81be7630e94f1183621200f18a6d8764f26ccd0a) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Upgrading runs a database migration that changes how Uppity records which sign-in
  method an account belongs to. It locks the accounts table while it runs, but that
  table holds one row per user, so on any normal instance it finishes in well under
  a second. Back up first regardless.

  A standard install needs nothing from you. Existing email and password accounts
  are converted in place, and everyone signs in exactly as before. Customers see no
  change at all.

  Forks that added a social or single sign-on provider are the exception. The
  migration refuses to guess at those accounts and stops with an error naming what
  it could not classify, so you can set the right values and run it again. Guessing
  was the other option, and it would have produced accounts that quietly fail to
  link on the next sign-in rather than an upgrade that stops while you are watching.

## 0.1.6

### Patch Changes

- [#75](https://github.com/NeonRook/uppity/pull/75) [`ae1a88b`](https://github.com/NeonRook/uppity/commit/ae1a88bb6d646911b86a5e1aa191fea41c2d54a6) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Groundwork for buying extra monitor capacity on the Uppity plan. Nothing changes yet: plan limits are exactly what they were, and self-hosted instances remain unlimited as always. Upgrading runs one quick database migration and needs nothing from you.

- [#77](https://github.com/NeonRook/uppity/pull/77) [`dd3891d`](https://github.com/NeonRook/uppity/commit/dd3891d233a9f3eb2378f0b02154d2a46af113a6) Thanks [@lucasvienna](https://github.com/lucasvienna)! - The Docker image now applies Alpine security updates at build time, clearing the openssl advisory CVE-2026-45447.

## 0.1.5

### Patch Changes

- [#71](https://github.com/NeonRook/uppity/pull/71) [`8c8e36c`](https://github.com/NeonRook/uppity/commit/8c8e36c9ab258496971839cdec9929e053d763d7) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Update internal dependencies

- [#73](https://github.com/NeonRook/uppity/pull/73) [`5569de0`](https://github.com/NeonRook/uppity/commit/5569de09643a475ad3ab0a56fd49beba6103049d) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Fix the container image build, which had been failing since `@inlang/paraglide-js` moved to 2.24.0.
  That release pulls in `@inlang/sdk` 3, which replaced the WASM SQLite in `@lix-js/sdk` with a native
  addon whose prebuilt binaries are glibc-only, so message compilation could not run under Alpine. The
  build stages now use the Debian-based `oven/bun:1`; the runtime image is unchanged, still Alpine and
  still 165MB, because it only ever copies `build/` and `drizzle/` out of the builder.

## 0.1.4

### Patch Changes

- [#68](https://github.com/NeonRook/uppity/pull/68) [`72a2ce9`](https://github.com/NeonRook/uppity/commit/72a2ce97a4f040cfda18e7a3303512dcfd735259) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Shrink the runtime Docker image from 169MB to 165MB (46.2MB to 43.8MB pulled) and drop `node_modules` from it entirely. `auth.ts` now builds from `better-auth/minimal`, which removes Kysely and its unused sqlite/mysql/mssql dialects from the server bundle, and `@opentelemetry/api` is bundled rather than externalised — Vite resolves its ESM build, so better-auth's dynamic import still gets genuine named exports. With nothing left to exempt, the runtime allowlist is empty and the image ships only `build/`, `drizzle/` and a minimal manifest.

- [#66](https://github.com/NeonRook/uppity/pull/66) [`7cf5314`](https://github.com/NeonRook/uppity/commit/7cf531432894ba3a438356c521f522aecd5618b9) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Finish the maintenance window CRUD UI (NEO-11). An active window now renders in Ward Blue instead of the emerald that means "operational", and a cancelled one no longer borrows the scarlet reserved for a monitor that is down. Windows that have not started can be deleted outright; anything that has already suppressed an alert can only be cancelled, so the record of why alerting went quiet survives.

  The monitor selector gained a filter, a selected count and a clear action — it was an unfiltered checkbox list, which does not survive the 2,000 monitors a Dedicated plan allows — and finished windows now list the monitors they covered instead of rendering every monitor as a disabled checkbox. Times, durations and the newly shown window length are set in mono per the Measured-Value Rule, upcoming windows sort soonest-first, and an organisation with no windows sees one empty state rather than four.

  Service rejections now carry stable codes and are translated through Paraglide across `en`, `de` and `pt-br`; previously the raw English strings reached the form. `datetime-local` fields name the browser's time zone, which they never did. Cancel and delete moved to remote commands, matching every other row action in the app.

## 0.1.3

### Patch Changes

- [#64](https://github.com/NeonRook/uppity/pull/64) [`87b3b2a`](https://github.com/NeonRook/uppity/commit/87b3b2a2982fb3608794b21e3865c7fd85e1b08f) Thanks [@lucasvienna](https://github.com/lucasvienna)! - Shrink the runtime Docker image from 726MB to 169MB. The SSR graph is now fully bundled instead of externalised, so the image ships no dependency tree beyond `@opentelemetry/api` — the one package that must resolve at run time. The base image moved to `oven/bun:1-alpine`, server sourcemaps are no longer shipped, and a new build-time check (`check:externals`) fails the build if the server bundle imports anything the image will not contain.

## 0.1.2

### Patch Changes

- [#59](https://github.com/NeonRook/uppity/pull/59)
  [`de73444`](https://github.com/NeonRook/uppity/commit/de73444c40411cdd8f13b04c9af07be2ea9aca60)
  Thanks [@lucasvienna](https://github.com/lucasvienna)! - Shrink the container
  image from 1.11 GB to 726 MB. The runtime image was installing optional peer
  dependencies of production packages — including `vitest`, `drizzle-kit` and
  `esbuild` — which added roughly 275 MB and 35 vulnerable esbuild binaries that
  nothing at runtime used. Database migrations now run through `drizzle-orm`'s
  migrator rather than `drizzle-kit`.

## 0.1.1

### Patch Changes

- [#55](https://github.com/NeonRook/uppity/pull/55)
  [`70143b8`](https://github.com/NeonRook/uppity/commit/70143b8eb60bfd5d57b74846be32df81ea1eca81)
  Thanks [@lucasvienna](https://github.com/lucasvienna)! - Rework the release
  pipeline: pull-request checks are now gated separately from publishing, and
  container images are built for amd64 and arm64 with a verifiable build
  provenance attestation.

## [0.1.0] - 2026-01-27

### Added

- Initial public release
- HTTP, TCP, and push-based monitor health checks
- Incident tracking and management
- Multi-channel notifications (Email, Slack, Discord, Webhooks)
- Public status pages for customers
- Organization-based multi-tenant authentication
- Admin panel for user and organization management
- Docker and Docker Compose deployment support

[0.1.0]: https://github.com/NeonRook/uppity/releases/tag/v0.1.0
