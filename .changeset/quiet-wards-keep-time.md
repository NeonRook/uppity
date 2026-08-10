---
"uppity": patch
---

Finish the maintenance window CRUD UI (NEO-11). An active window now renders in Ward Blue instead of the emerald that means "operational", and a cancelled one no longer borrows the scarlet reserved for a monitor that is down. Windows that have not started can be deleted outright; anything that has already suppressed an alert can only be cancelled, so the record of why alerting went quiet survives.

The monitor selector gained a filter, a selected count and a clear action — it was an unfiltered checkbox list, which does not survive the 2,000 monitors a Dedicated plan allows — and finished windows now list the monitors they covered instead of rendering every monitor as a disabled checkbox. Times, durations and the newly shown window length are set in mono per the Measured-Value Rule, upcoming windows sort soonest-first, and an organisation with no windows sees one empty state rather than four.

Service rejections now carry stable codes and are translated through Paraglide across `en`, `de` and `pt-br`; previously the raw English strings reached the form. `datetime-local` fields name the browser's time zone, which they never did. Cancel and delete moved to remote commands, matching every other row action in the app.
