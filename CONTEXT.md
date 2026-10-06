# Uppity

Code-level vocabulary: the terms as they appear in the schema and the service layer, and
the places where an implementation word diverges from a product word.

`PRODUCT.md` owns the product nouns (monitor, check, incident, maintenance window,
notification channel, status page, capacity block) and `DESIGN.md` owns the visual ones.
A term defined in either does not belong here.

## Language

**Scheduled reduction**:
A lower capacity-block count a customer has asked for, held until their billing period
ends. Distinct from the count in force, which is what the monitor ceiling and the Polar
meter both read. See `docs/adr/0004`.
_Avoid_: Pending downgrade, block cancellation, queued change

**Ops alert**:
A message to whoever runs the instance, about the instance itself. Reaches a configured
operator address rather than an organization, and is never routed through the customer
notification channels.
_Avoid_: Admin notification, system notification, internal alert
