---
"uppity": patch
---

Building the image from source no longer downloads every dependency twice; the dependency layer now caches the way the Dockerfile always intended.
