---
"uppity": minor
---

Upgrading runs a database migration that changes how Uppity records which sign-in
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
