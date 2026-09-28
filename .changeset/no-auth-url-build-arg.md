---
"uppity": patch
---

Building the image no longer takes a `VITE_BETTER_AUTH_URL` build argument, and the app no longer reads that variable. You can remove it from your build command and environment. `BETTER_AUTH_URL` is unchanged.
