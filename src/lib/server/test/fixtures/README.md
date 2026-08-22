# Test fixtures

`self-signed-key.pem` and `self-signed-cert.pem` are a throwaway self-signed pair
generated for `src/lib/server/tcp.spec.ts`, which needs a TLS server to read a
certificate off. The key guards nothing, is not used outside the test suite, and
is committed so the suite needs no OpenSSL at run time.

Regenerate with:

```sh
openssl req -x509 -newkey rsa:2048 -keyout self-signed-key.pem -out self-signed-cert.pem \
  -days 36500 -nodes -subj "/CN=localhost/O=Uppity Test CA" -addext "subjectAltName=DNS:localhost"
```

The spec asserts on the `O=Uppity Test CA` issuer, so keep the subject if you do.
