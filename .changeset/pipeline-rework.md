---
"uppity": patch
---

Rework the release pipeline: pull-request checks are now gated separately from publishing, and
container images are built for amd64 and arm64 with a verifiable build provenance attestation.
