---
"uppity": patch
---

Logs now report the running release instead of `0.0.1`. Checks of a down target log at info level with `status="success"`, keeping the outcome in `check_status` and `check_error`, and `status="error"` now means the worker itself failed. If you alert on `status="error"` to catch down checks, switch to `check_status="down"`.
