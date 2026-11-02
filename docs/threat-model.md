# Threat model

Assets: plaintext entry fields, the master passphrase, the data key, passkey credentials, session tokens, encrypted backups, and account metadata.

Trusted components: the user's browser/device while unlocked, published client code and dependencies, cryptographic implementations, and the account authorization service. PostgreSQL is trusted for availability and accepted-write consistency, not for keeping entry fields confidential without encryption.

| Threat                                      | Implemented defense                                                                   | Residual risk                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Database-only theft                         | Argon2id-wrapped random data key; AES-GCM on all entry fields                         | Offline passphrase guessing; visible handle, sizes, counts, timestamps, public passkey material, session/CSRF metadata |
| Cross-account access                        | Session-derived account ownership checks on all routes and mutations                  | API compromise can access account metadata and encrypted records                                                       |
| CSRF                                        | Exact Origin, required JSON content type, session-bound CSRF tokens, SameSite cookies | XSS executes within the trusted origin                                                                                 |
| Replayed WebAuthn response                  | Single-use, five-minute challenge; origin/RP checks; required user verification       | Authenticator/device compromise and malicious clients remain possible                                                  |
| Unauthorized passkey enrollment             | Recent verification, session-bound ceremony, transactional passkey count limit        | A stolen recently verified browser session has a limited enrollment window                                             |
| Edited ciphertext or swapped IDs/revisions  | AES-GCM authentication and domain-separated AAD                                       | A malicious server can delete records or replay previously valid versions                                              |
| Concurrent edits                            | Transactional ownership/revision checks; 409 UI preserving draft                      | No distributed offline merge or historical version recovery                                                            |
| Network response lost after commit          | Cached ciphertext retries and exact idempotent API acceptance                         | A modified draft is a new operation; the user may need conflict resolution                                             |
| Incomplete or mixed export                  | Complete authenticated backup snapshot and per-entry verification                     | A valid older export cannot be cryptographically distinguished from the latest                                         |
| Malicious backup KDF or large input         | Strict fixed KDF settings, schemas, file/body/capacity limits                         | Browser resources still depend on device capacity                                                                      |
| Browser left unattended                     | Manual/idle/cross-tab lock, reload locked, epoch guards                               | JavaScript cannot prove memory erasure; clipboard, screenshots, extensions, and OS remain outside control              |
| XSS or compromised server-served JavaScript | Text rendering, restrictive CSP, no third-party scripts, dependency checks            | An unlocked vault or passphrase entered into malicious code can be stolen                                              |
| Forgotten passphrase / lost passkeys        | Explicit recovery limits, additional passkeys, encrypted export/import                | No forgotten-passphrase reset or account-access recovery                                                               |
| Event tampering                             | Separate restricted runtime role with SELECT/INSERT event access in production        | DB admins and maintenance credentials can change/delete events                                                         |
| Database outage                             | Readiness failure, generic 503, no confirmed-success UI before commit                 | Single database/service instance remains an availability dependency                                                    |

No server-side search index, analytics, externally loaded favicons/fonts, or third-party breach/AI checks receive vault data. Password health only checks local length and reuse; it does not estimate full entropy or prove a password has never leaked.

Master-passphrase changes rewrap the same data key. Historical ciphertext/backups remain usable with historical passphrases. Session revocation cannot erase data already downloaded or copied. Full compromise rotation, encrypted sharing, mobile/extension autofill, emergency access, and malicious-server freshness protection need separate designs.

This model and the automated evidence do not replace an independent cryptographic/application security review. The project makes no GDPR/DORA/NIS2 certification or compliance claim.
