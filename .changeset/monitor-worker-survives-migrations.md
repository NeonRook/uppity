---
"uppity": patch
---

The monitoring worker no longer shuts down for good when it starts while an upgrade's database migration is still running. It keeps checking monitors and finishes its startup once the migration lands, so an upgrade no longer needs a manual restart of the worker to resume monitoring.
