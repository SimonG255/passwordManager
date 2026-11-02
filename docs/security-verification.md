# Verification evidence

Performed locally on 2 November 2026 on Windows with Node 24.14.0, PostgreSQL 18.6, and Playwright Chromium 156. Synthetic credentials only.

## Verified boundaries

| Boundary                   | Evidence                                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cryptography               | Tests check an independent Node/OpenSSL Argon2id result, the AES-256-GCM known-answer primitive, unlock, tampering, changed AAD, fresh IVs, KDF bounds, complete backup authentication, and rewrapping.     |
| Browser → API              | Built-application tests create accounts with a virtual user-verified passkey and exercise actual origin/CSRF/session behavior. API payloads are checked against recognizable synthetic plaintext markers.   |
| API → PostgreSQL           | Integration tests use a real isolated PostgreSQL database. Ownership, concurrent revisions, transactional import, idempotent retries, session expiry, and enrollment freshness are checked.                 |
| Data → browser             | Reload requires unlocking; saved entries decrypt correctly. Conflicting edits keep the stale draft and cannot overwrite the newer accepted revision.                                                        |
| Lost response after commit | Browser interception allows the API commit, drops the response, then retries the identical envelope. Exactly one entry exists afterward.                                                                    |
| Export → different vault   | The browser downloads a complete encrypted export, creates a different account/vault, restores with the source passphrase, and verifies the recovered fields.                                               |
| Browser storage/lock       | Browser tests find no application localStorage/sessionStorage keys. Idle, manual, reload, revocation, and cross-tab flows clear decrypted UI. Worker termination and operation epochs guard late responses. |
| Accessibility              | Axe checks WCAG 2 A/AA and 2.1 A/AA tags on the account and demo-vault screens. These checks are scoped evidence, not an accessibility certification.                                                       |
| Recovery                   | A PostgreSQL custom dump was restored after destroying its precisely named synthetic source database, then all decrypted fields were compared. See [recovery-drill.json](evidence/recovery-drill.json).     |

Commands: `npm run check`, `npm run test:e2e`, `npm run test:recovery`, and `npm audit`. Current suites contain 23 unit/integration tests and eight browser stories. The browser suite builds and serves the actual application with its CSP instead of relying on the Vite development proxy. All automated passkey flows use Chromium's virtual authenticator.

## Measured performance

The recorded [benchmark](evidence/benchmark.json) uses 1,000 synthetic entries on an Intel i5-13600K, Windows, Chromium 156, with the documented 64 MiB / three-iteration / four-lane Argon2id configuration. One local run measured approximately:

- Vault creation including worker/key setup: 209 ms.
- Unlock including worker setup: 183 ms.
- Encryption of 1,000 entries through worker RPC: 50 ms.
- Decryption of 1,000 entries: 32 ms.
- Median local title/username filter over 50 samples: 0.1 ms.

These are observed local measurements, not cross-device guarantees. Benchmark the intended mobile devices before a real release. No uptime, production load capacity, or independent security-audit claims are made.

## Verification limits

- No physical authenticator, biometric prompt, Safari, or Firefox was manually tested.
- No public HTTPS hosting environment, production proxy, failover, or external monitoring service was configured.
- Docker is unavailable here, so the container/Compose files were not executed.
- The GitHub Actions and Gitleaks workflow is provided but was not run on GitHub. Local dependency auditing was performed.
- The application has not received an independent penetration test or cryptographic audit.
- Browser-memory erasure cannot be proven. Client-side encryption does not protect an unlocked vault against malicious delivered JavaScript, browser extensions, or endpoint compromise.
- The database can replay valid historical ciphertext; record freshness against a malicious server is not cryptographically proved.
- Storage/network marker checks are evidence for the exercised paths, not proof that every possible leak is absent.

The threat model and runbook define recovery, metadata exposure, maintenance privileges, and remaining work. Use fictional credentials until independent review.
