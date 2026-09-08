---
"uppity": patch
---

The account issuer column added in the last release is gone again. The auth library that required it withdrew the requirement in its 1.7.3 release, and this upgrade drops the column and its index. The migration is quick and does not touch any other table.
