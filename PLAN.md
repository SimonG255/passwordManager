# Password manager portfolio plan for U-centrix

Prepared: 2 November 2026. Status: version 1 implemented locally. See README.md and docs/security-verification.md for completed verification and remaining deployment and independent-review work.

Build a polished personal password vault that demonstrates secure design, reliable data handling, testing, and ownership from requirements through deployment. The interview story should be: **I can explain how the system protects secrets, show evidence for its behavior, and recover it when something fails.**

## 1. Why this project fits the employer

[U-centrix's website](https://u-centrix.com/sl/) emphasizes secure software, traceability, controlled access, and operational continuity for regulated industries. Its [web and cloud development page](https://u-centrix.com/sl/web-cloud-development/) lists React, Angular, Node, Java, and AWS. Its DORApp work also makes auditability a relevant theme.

My recommendation is an inference from those public priorities, rather than a claim about their interview criteria or the stack of a particular vacancy.

| Company priority  | What this project should demonstrate                                    |
| ----------------- | ----------------------------------------------------------------------- |
| Security          | Browser-side encryption, a threat model, and negative security tests    |
| Controlled access | Passkey authentication, revocable sessions, and strict ownership checks |
| Traceability      | Minimal security events and documented architectural decisions          |
| Reliability       | Conflict-safe saves, tested backup restoration, and safe migrations     |
| Maintainability   | Small modules, typed interfaces, useful tests, and reproducible setup   |
| Product delivery  | A usable interface, a working deployment, and a short demonstration     |

Keep the product personal and single-owner in version 1. Team sharing introduces a separate key-distribution and revocation problem and belongs in a later release.

## 2. Recommended technology

**Choose TypeScript throughout the application.** React and Node align with the company's published technologies, and one language makes it practical to finish and explain the whole system.

| Area               | Choice                                                                   | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Frontend           | React, TypeScript, Vite                                                  | A responsive vault interface with explicit locked/unlocked states   |
| API                | Node.js, TypeScript, Fastify                                             | A small modular API with runtime request validation                 |
| Database           | PostgreSQL and Prisma migrations                                         | Ownership constraints, transactions, and revision checks            |
| Authentication     | SimpleWebAuthn browser/server libraries                                  | Passkey registration and sign-in using established WebAuthn tooling |
| Vault cryptography | Web Crypto AES-256-GCM; a maintained browser-compatible Argon2id library | Authenticated encryption and password-based key derivation          |
| Verification       | Vitest, React Testing Library, Playwright                                | Crypto behavior, API integration, and complete user flows           |
| Delivery           | Docker Compose and GitHub Actions                                        | Reproducible local setup and automated checks                       |
| Hosting            | One HTTPS origin for frontend/API; PostgreSQL on private networking      | Straightforward deployment and session behavior                     |

Use supported stable releases when implementation begins. During the first week, verify Argon2id library maintenance, browser compatibility, test vectors, and Web Worker support before selecting the package. Use a supported Node LTS compatible with the selected dependencies.

Start with one API deployment and one database. A small modular application is enough to demonstrate sound architecture. Choose an affordable EU hosting region when deploying; budget and hosting access are still unspecified.

Suggested structure:

```text
apps/web/                 React UI and client vault state
apps/api/                 Authentication, sessions, encrypted storage, events
packages/vault-crypto/    Browser encryption, key derivation, envelope parsing
packages/contracts/      Transport schemas; no keys or plaintext vault models
docs/                    Threat model, decisions, runbook, test evidence
```

The API must not depend on client decryption code or receive decrypted entries.

## 3. Version 1 scope

Complete these flows before adding optional features:

1. **Create an account and register a passkey.** Allow a second passkey to be enrolled after reauthentication. Use a username/handle; email delivery is unnecessary for the initial project.
2. **Create and unlock a vault.** Choose a separate master passphrase, explain its recovery implications, and unlock locally after signing in.
3. **Manage login entries.** Create, read, edit, and delete a title, website, username, password, and notes. Encrypt every field, including titles and URLs.
4. **Generate passwords.** Use cryptographically secure randomness and unbiased character selection. Offer sensible length controls and accessible feedback.
5. **Search locally.** Search decrypted titles and usernames only while unlocked; never send search terms or build a plaintext server index.
6. **Lock the vault.** Support manual lock, a configurable inactivity timer, and coordinated locking across open tabs. Clear sensitive UI state on lock and session expiry.
7. **Save safely across tabs/devices.** Show pending/saved/failed states and a clear conflict-resolution flow. Never silently overwrite a newer revision.
8. **Export and restore an encrypted backup.** Restore into a fresh environment and verify actual entry contents.
9. **View sessions and security activity.** Revoke other sessions and show sign-ins, revocations, and server-accepted vault changes without recording secrets.

The UI needs deliberate empty, loading, locked, invalid-passphrase, network-failure, and save-conflict states. Support keyboard navigation, visible focus, labeled controls, and mobile screens. Provide explicit copy/reveal controls. Clipboard clearing can be best-effort where supported; do not promise it always works.

Use generic website icons. Loading third-party favicons could disclose which sites a user stores. Render notes as text and restrict navigable website links to safe HTTP/HTTPS URLs.

## 4. Security design to agree before implementation

### Separate account access from vault unlocking

Passkeys prove who may fetch or change encrypted records. The master passphrase unlocks those records in the browser. The passphrase and unwrapped encryption keys must never be sent to the API.

Use [SimpleWebAuthn's verification flow](https://simplewebauthn.dev/docs/packages/server), including expected origin, relying-party ID, challenge, and required user verification. Store short-lived challenges server-side, bind them to the ceremony, and consume them once. Secure initial account creation and subsequent passkey enrollment separately; enrolling a new credential requires an authenticated, recently verified session.

Use opaque server-side sessions with Secure, HttpOnly, SameSite cookies, session expiry, rotation at authentication, and revocation. Add CSRF protection and origin checks to mutations; SameSite is a supporting control. Follow [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

### Encrypt a vault with an independently generated data key

1. Generate a random 256-bit data-encryption key in the browser.
2. Derive a key-encryption key from the master passphrase using Argon2id and a random per-vault salt of at least 128 bits.
3. Encrypt, or "wrap," the data key with the derived key using authenticated encryption.
4. Encrypt each entry with the data key using AES-256-GCM. Generate a fresh 96-bit IV for every encryption, including edits and key wrapping; never intentionally reuse an IV with its key. Set conservative operation limits.
5. Bind the format version, vault ID, entry ID, and record revision using unambiguous authenticated additional data. Distinguish key-wrapping and entry envelopes.
6. Send ciphertext, IVs, wrapped keys, salts, bounded KDF parameters, format versions, and necessary operational metadata to the server.

Use established implementations; do not implement encryption primitives yourself. [OWASP recommends authenticated encryption](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html), and [MDN explains AES-GCM IV and additional-data requirements](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams).

Benchmark the Argon2id configuration in a Web Worker on the intended devices. Start the investigation with the memory-constrained recommendation in [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html#section-4), record the actual chosen parameters and unlock time, and document any adjustment. Validate supported parameter bounds before allocation so malicious files cannot request unreasonable work. Store KDF/format versions so future migration is possible.

Changing the master passphrase rewraps the data key with a new salt, derived key, and IV. It does not revoke access to historical ciphertext copies held by someone with the old passphrase; compromise recovery requires a broader key-rotation design.

Keep decrypted data and usable keys in memory only. Avoid persistence through localStorage, IndexedDB, browser caches, analytics, crash reporting, or application logs. On lock, drop references and clear buffers where possible; JavaScript cannot guarantee complete memory erasure.

### Be precise about protection and recovery

| Threat or failure                                           | Planned behavior and limit                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Stolen database or server backup                            | Entry fields remain encrypted; weak passphrases can still be guessed offline                                    |
| Another authenticated user requests an entry                | The API rejects access using server-enforced ownership checks                                                   |
| Ciphertext or entry identity is altered                     | Authenticated decryption fails; do not display partial plaintext                                                |
| Two clients edit the same revision                          | An atomic revision check rejects the stale update and preserves the newer data                                  |
| A browser script or endpoint is compromised                 | An unlocked vault can be exposed; client encryption does not solve this                                         |
| A malicious server serves altered JavaScript or old records | This design does not prevent secret theft at unlock or prove record freshness                                   |
| The master passphrase is forgotten                          | Version 1 cannot decrypt the vault; account recovery and passkeys do not recover it                             |
| All passkeys are lost                                       | No account-access recovery in version 1; an existing encrypted export can be opened locally with its passphrase |

State these limitations in the product and documentation. Describe the project as a portfolio security prototype, with claims limited to the documented threat model. Real credential use would require independent security review. Do not claim GDPR, DORA, or NIS2 certification or compliance.

## 5. Data, API, and audit boundaries

Plan tables for accounts, passkey credentials, authentication challenges, sessions, vault key envelopes, encrypted entries, and security events. The server will necessarily know account identifiers, record counts, sizes, and operation times; document that metadata exposure.

For each entry mutation, authorize the owner, validate the encrypted envelope and size limits, and perform a revision comparison/update in one database transaction. Return a conflict response for stale edits. Make retries identifiable so a lost response does not create duplicate entries. Check ownership on list, item, update, delete, export-related fetch, and session routes.

Audit only events the server can substantiate, such as successful authentication, session revocation, and accepted record changes. A browser-side reveal, copy, unlock, or local export is not a server-verifiable audit event. Do not present it as one. Record minimal actor/action/time/outcome identifiers with a documented retention period. Avoid request bodies, credentials, session tokens, entry fields, and secrets in logs.

Use a restricted database role and append-only application access for events, but acknowledge that database administrators could still alter them. An ordinary audit table is not an immutable ledger.

An exported backup must include the versioned key envelope and everything needed for standalone decryption. Authenticate the complete exported snapshot, including its manifest, so removing or mixing records is detected during import. Validate limits and decrypt before committing any restore. Import into an existing vault by re-encrypting locally under its key and new IDs; make failure leave existing data intact.

## 6. Suggested schedule

Assumption: about **8 weeks at 12–15 hours per week**, or 96–120 hours, for someone already comfortable building web applications. This is a planning estimate; unfamiliarity with browser cryptography, WebAuthn, or deployment may extend it. Cut optional features first if time is limited.

| Week | Deliverable                                                             | Evidence required before moving on                                                                               |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | Requirements, wireframes, threat model, architecture, dependency spikes | Explain key flow; run Argon2id in a worker; prove passkey registration/sign-in on the intended stable origin     |
| 2    | Local encrypted vault and password generator                            | Create/unlock/edit/lock works; wrong passphrases and altered ciphertext fail; crypto tests use published vectors |
| 3    | Accounts, passkeys, sessions, ownership-protected API                   | Two users are isolated; invalid/replayed ceremonies fail; logout and revocation invalidate sessions              |
| 4    | Encrypted synchronization and conflict UI                               | Browser-to-database flow works; a stale edit cannot overwrite a newer save; retry behavior is demonstrated       |
| 5    | Encrypted export/import and security activity                           | Restore a backup in a fresh environment; truncated/tampered backup fails without partial changes                 |
| 6    | Security hardening and failure tests                                    | Negative tests pass; CSP/CSRF controls are checked; lock, expiry, and network failure behave correctly           |
| 7    | Deployment, monitoring, database backup and restore                     | Run from a clean checkout; deploy over HTTPS; restore a database backup and unlock real synthetic entries        |
| 8    | Usability polish, documentation, demonstration, contingency             | Walk through the project in five minutes; publish actual test/restore results and explain the tradeoffs          |

Keep a stable HTTPS hostname for passkeys; changing relying-party configuration affects credential usability. Keep local and deployed credentials/configuration separate.

If only 2–3 weeks become available, finish a local encrypted vault with a tested encrypted export/import and excellent documentation. Present synchronization, hosted authentication, and operational features as future work until they exist.

## 7. Verification that makes the project credible

Write tests around failure and security boundaries, not just successful CRUD:

- Verify KDF/encryption behavior against published or independent known-answer vectors, plus browser round trips.
- Check wrong passphrases, malformed envelopes, tampered ciphertext, changed additional data, unsupported versions, and excessive KDF parameters.
- Check repeated encryption uses fresh IVs and a single encrypted record cannot be swapped into another record's identity.
- Use two real test accounts to attempt every cross-account read and write through the API.
- Test expired/replayed authentication challenges, wrong origin/RP ID, unauthorized credential enrollment, CSRF rejection, and revoked sessions.
- Make two clients edit one revision; verify only one succeeds and the other gets an actionable conflict.
- Interrupt a save and retry; verify the UI does not claim success early or duplicate entries.
- Verify idle lock, cross-tab lock, session-expiry handling, and removal of decrypted search results after locking.
- Capture requests, database contents, logs, and browser storage while using recognizable synthetic secrets; check that vault plaintext and master passphrases do not appear there. This is evidence, not a proof against every leak.
- Export, destroy a disposable test environment, restore, and compare entry contents. Test damaged and incomplete exports and database backups.

Run type checking, linting, unit/integration tests against a disposable PostgreSQL database, a production build, and essential browser flows in CI. Use an automated WebAuthn authenticator for browser tests and also manually verify a real passkey on a supported device. Add secret/dependency scanning and assess findings before release.

Set a modest initial limit such as 1,000 entries per vault and measure unlock and local-search behavior with synthetic data. Report the device, dataset, chosen KDF settings, and measured results; don't publish invented performance or uptime claims.

## 8. Deployment and operational evidence

Provide Docker Compose for local development, an example environment file with placeholders, and a migration procedure. Use TLS, a restrictive Content Security Policy, safe rendering, request limits, and appropriate cache-control headers. Keep third-party scripts out of unlocked-vault pages.

The deployed API should have health/readiness checks, structured redacted logs, error-rate and latency measurements, and graceful database-failure behavior. Back up the database and protect infrastructure credentials separately. Database backups contain encrypted vault content plus account metadata and must still be protected.

Write a short runbook covering deployment, migration failure, service restart, database restoration, passkey origin configuration, dependency updates, and the limits of vault recovery. Record one actual recovery drill. Deploy the demo with synthetic data and a documented retention/cleanup policy.

## 9. Interview package

The final repository should include:

- `README.md`: purpose, screenshots, setup, demo link, limitations, and verification commands.
- `docs/architecture.md`: system boundaries, account/vault separation, key lifecycle, encrypted format, and sync behavior.
- `docs/threat-model.md`: assets, attackers, abuse cases, mitigations, metadata exposure, and residual risks.
- `docs/decisions/`: short decisions explaining TypeScript, passkeys plus master passphrase, key wrapping, and single-application deployment.
- `docs/security-verification.md`: actual checks, results, measurements, unresolved findings, and exact scope.
- `docs/runbook.md`: deployment and a demonstrated restore procedure.
- `docs/demo.md`: a five-minute script and a link to a short recording.

Use meaningful commits and small issues with acceptance criteria. Document what is implemented separately from planned work.

Suggested five-minute demonstration:

1. Explain the user problem and the account/vault separation.
2. Sign in, unlock, generate a password, and save a synthetic login.
3. Show that the stored entry fields and API payload are ciphertext.
4. Attempt cross-account access and show rejection; then demonstrate a stale-edit conflict.
5. Restore an encrypted backup and show the verification evidence.
6. Explain one limitation clearly: a compromised browser can expose an unlocked vault, and forgotten master passphrases cannot be reset into decryption.

Provide a short recording so a reviewer can see the complete flow without creating a passkey immediately. Keep the working application available for hands-on review.

## 10. Optional work after the core is finished

Choose at most one addition before the interview:

- A local password-health view for reused and weak passwords, computed only while unlocked.
- Slovenian and English interface support.
- A narrowly scoped browser extension, after separately designing origin matching, permissions, and autofill security.

Team vaults, encrypted sharing, emergency access, account recovery, full offline synchronization, and mobile clients are later projects. Each adds a meaningful security or consistency problem. Add them only after documenting a separate design.

## 11. First implementation tasks

1. Turn version 1 flows into small issues with the acceptance criteria above.
2. Write the first threat model and key-flow decision before defining the database schema.
3. Spike browser Argon2id, encryption, and real passkeys; resolve library and hosting-origin uncertainty.
4. Scaffold the workspace, local PostgreSQL, environment validation, and CI.
5. Finish one local vertical slice: create vault, add entry, lock, unlock, and recover the entry.
6. Introduce authenticated encrypted storage, then concurrency and recovery.

The project is ready to present when the complete flow works from a clean checkout, security claims have supporting evidence, backup restoration has been performed, and you can explain the design and its limitations without relying on a tutorial.
