# Architecture and key lifecycle

Vaultline uses React/Vite, TypeScript/Fastify, Prisma 7, and PostgreSQL. The API has no dependency on the client cryptography package. Production serves the frontend and API from one origin. Development proxies `/api` to a local API process.

## Boundaries

1. An account holds a public handle, passkey public credentials, opaque sessions, and one personal vault.
2. A passkey ceremony establishes an account session. It verifies the exact origin, RP ID, single-use expiring challenge, signature, and user verification.
3. The browser derives a key-encryption key from the master passphrase in a worker. A random 256-bit data key is encrypted under that key.
4. Every entry field is encrypted under the data key. The API authorizes access to those opaque records without receiving decrypted fields.
5. The React UI holds decrypted entries only while unlocked; the worker holds the active data key. Lock terminates the worker, rejects outstanding RPCs, clears entries/dialogs/search state, and increments an operation epoch so late responses cannot repopulate the vault.

## Cryptographic format

All formats are strict version-1 schemas in `packages/contracts`. Binary values use unpadded base64url.

- KDF: Argon2id, 65,536 KiB, three iterations, four lanes, 32-byte output, 16-byte random salt. Imports accept only this supported configuration, preventing attacker-controlled KDF allocation.
- Wrapping/entry cipher: AES-256-GCM, random 12-byte IV, 16-byte authentication tag. Keys are imported into Web Crypto as non-extractable handles. The raw data-key buffer remains in the worker because rewrapping is supported.
- Wrapping AAD: JSON tuple `['vaultline', 1, 'key', vaultId, keyVersion, kdf, salt]`. The schema fixes object field order before reconstruction.
- Entry AAD: JSON tuple `['vaultline', 1, 'entry', vaultId, entryId, revision]`.
- Backup AAD: JSON tuple `['vaultline', 1, 'backup', keyEnvelope]`. The complete snapshot, including its entry manifest, is encrypted as one authenticated message. Each contained entry remains independently authenticated.

Fresh encryption always draws a new IV with `crypto.getRandomValues`. A retry reuses the identical ciphertext envelope; it does not run encryption again with the same IV. Password generation uses rejection sampling to avoid modulo bias.

The master passphrase is not normalized or trimmed for derivation. New passphrases require at least 14 characters. This minimum is a usability floor, not proof that a phrase is unpredictable. There is no server-side verifier for the master passphrase and no email-reset path into the data key.

## Writes and concurrency

All entry mutations lock/update the owning vault row in a transaction before examining entries. An update carries `expectedRevision`; its encrypted envelope must carry `expectedRevision + 1`. Exactly one of two different updates to the same revision succeeds. The other returns 409, leaving the editor's draft intact until the user chooses to discard it and reload.

An exact replay of an already accepted ciphertext succeeds without duplicating records. Imports use fresh entry IDs and the target data key, validate the full batch, check capacity, and insert atomically. Failed imports roll back all changes. A key-envelope version check prevents stale clients from writing after passphrase changes. Generation and size limits bound the accepted workload. Deletions are permanent; offline editing and tombstone synchronization are outside version 1.

Client synchronization polls every 30 seconds while unlocked, and surfaces failures. A session failure locks the client. Data returned in flight is guarded by the operation epoch. The backend enforces session absolute/idle expiry; the browser independently enforces its configured local inactivity timeout.

## Sessions and events

The browser receives a random opaque token in a host-only HttpOnly, SameSite=Strict cookie. Production adds Secure and the `__Host-` prefix. Only the SHA-256 digest of the token is stored in PostgreSQL. CSRF tokens are random and tied to the session; pre-authentication ceremonies use an HttpOnly cookie/token pair plus exact Origin checks. Mutation bodies must be JSON.

Sessions last at most 24 hours and expire after 30 minutes without API activity. Server last-seen timestamps are refreshed at most once per minute. Passkey reauthentication rotates the session and binds the ceremony to the current account/session. Enrollment and passphrase changes require verification within five minutes.

Server events record accepted account/session/record operations without secrets or entry identifiers. Event listing is scoped to the account and last 90 days. Local unlock/reveal/copy/export operations are deliberately absent because the server cannot verify them. Production uses a separate maintenance job for deletion after 90 days so the runtime role can stay append-only on events.

The database administrator remains trusted for metadata, availability, and event integrity. Replicated deployment would need a shared rate-limit store; the current limiter and service process are single-instance.
