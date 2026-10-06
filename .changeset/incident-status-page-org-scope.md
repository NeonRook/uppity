---
"uppity": patch
---

Security: fixed flaws that let any signed-in user change another organization's incidents and status pages. An attacker could post updates to someone else's incident, which could resolve it and send that organization's notifications. They could rewrite any postmortem shown on a public status page, and add or remove monitors and groups on another organization's status page. By linking another organization's monitors to their own incidents and status pages, they could make a public status page show an outage that wasn't real, or show another organization's incidents, including ones never meant to be public. Incident and status page changes now apply only within your own organization, and public status pages no longer send internal page details to visitors.

Status pages and notifications now ignore links between organizations, including ones that already exist, so nothing leaks after upgrading. Operators should still remove such links: status page monitors and incident monitors that join two organizations, and incident updates written by someone outside the incident's organization. The pull request linked from this entry has read-only queries that find them.
