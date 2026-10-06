---
"uppity": patch
---

Security: fixed a flaw that let any signed-in user start a checkout for an organization they did not belong to. The resulting subscription could replace that organization's billing, and cancelling it could move the organization to Free while its real subscription kept being charged. Only owners and admins of an organization can now start a checkout or view its subscriptions, and subscription events from Polar change an organization only when they concern the subscription it is billed through.

Instances running with Polar billing should check that every paid organization is billed to one of its own owners or admins. This release stops new mismatches but does not repair existing ones. Self-hosted instances without Polar billing were not affected.
