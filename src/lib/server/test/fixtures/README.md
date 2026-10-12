# Test fixtures

Throwaway certificates for the TLS tests in `src/lib/server/tcp.spec.ts`,
`src/worker/monitor/http.spec.ts` and `scripts/entrypoint.spec.ts`. They share one key, which guards nothing, is not
used outside the test suite, and is committed so the suite needs no OpenSSL at run
time.

| File                     | Certificate                                    |
| ------------------------ | ---------------------------------------------- |
| `self-signed-cert.pem`   | Self-signed for `localhost`, valid until 2126  |
| `expired-cert.pem`       | Self-signed for `localhost`, expired in 2020   |
| `other-host-cert.pem`    | Self-signed for `other.example`                |
| `untrusted-ca-cert.pem`  | For `localhost`, issued by a CA nobody trusts  |
| `extra-ca-cert.pem`      | A CA, trusted through `NODE_EXTRA_CA_CERTS`    |
| `extra-ca-leaf-cert.pem` | For `localhost`, issued by `extra-ca-cert.pem` |

Regenerate with OpenSSL 3.4 or later:

```sh
openssl req -x509 -newkey rsa:2048 -keyout self-signed-key.pem -out self-signed-cert.pem \
  -days 36500 -nodes -subj "/CN=localhost/O=Uppity Test CA" -addext "subjectAltName=DNS:localhost"
openssl req -x509 -key self-signed-key.pem -out expired-cert.pem \
  -not_before 20200101000000Z -not_after 20200102000000Z \
  -subj "/CN=localhost/O=Uppity Test CA" -addext "subjectAltName=DNS:localhost"
openssl req -x509 -key self-signed-key.pem -out other-host-cert.pem -days 36500 \
  -subj "/CN=other.example/O=Uppity Test CA" -addext "subjectAltName=DNS:other.example"
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -days 36500 -subj "/CN=Untrusted CA"
openssl req -new -key self-signed-key.pem -subj "/CN=localhost/O=Uppity Test CA" |
  openssl x509 -req -CA ca.pem -CAkey ca.key -out untrusted-ca-cert.pem -days 36500 \
    -extfile <(printf "subjectAltName=DNS:localhost\n")
rm ca.key ca.pem
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out extra-ca-cert.pem -days 36500 \
  -subj "/CN=Uppity Extra CA"
openssl req -new -key self-signed-key.pem -subj "/CN=localhost/O=Uppity Test CA" |
  openssl x509 -req -CA extra-ca-cert.pem -CAkey ca.key -out extra-ca-leaf-cert.pem -days 36500 \
    -extfile <(printf "subjectAltName=DNS:localhost\n")
rm ca.key
```

The specs assert on the `O=Uppity Test CA` issuer, so keep the subject if you do.
