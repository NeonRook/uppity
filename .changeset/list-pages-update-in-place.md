---
"uppity": patch
---

Deleting a monitor, incident, notification channel or status page from its list removes it right away. So does pausing or resuming a monitor or channel from the list. These actions had stopped updating the list: most pages showed a loading error until reload, and the incidents list kept showing the deleted incident.

When one of these actions, or removing a team member, cancelling an invitation or deleting an organization, is refused, the message now says why instead of a generic error. If a page fails to load, it offers a retry and the rest of the app stays usable.
