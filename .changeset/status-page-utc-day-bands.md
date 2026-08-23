---
"uppity": patch
---

Fixed uptime bands on status pages shifting by a day on instances running in a non-UTC timezone. A day on the band chart has always meant a UTC day, and it now stays one no matter what clock the host is set to. Instances left on UTC were never affected.
