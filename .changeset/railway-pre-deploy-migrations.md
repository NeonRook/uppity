---
"uppity": patch
---

The hosted service now applies pending database migrations as part of each deploy, before the new version takes traffic. Self-hosted installs already did this, through the published `docker-compose.yml`.
