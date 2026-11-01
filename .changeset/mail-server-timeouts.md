---
"uppity": patch
---

Uppity now gives up on a mail server that stops answering: after 30 seconds when connecting, or 60 seconds of silence once connected, instead of 2 and 10 minutes. Self-hosted operators with a relay that stays silent for longer will see those sends fail, and alert emails are tried again later.
