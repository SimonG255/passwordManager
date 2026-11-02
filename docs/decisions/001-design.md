# Core design decisions

## TypeScript with React and Fastify

One language keeps the UI, schemas, API, and test harness understandable. React and Node align with U-centrix's publicly listed technologies. Fastify keeps the service small and explicit; runtime schemas validate the actual transport boundary. PostgreSQL transactions enforce the consistency claims. Prisma 7 is pinned to a stable release rather than the registry's current Prisma 8 release-candidate tag.

## Passkeys for account access; a passphrase for the vault

The server does not receive the master passphrase or a reusable derived vault-unlock secret. WebAuthn supplies account authentication through established SimpleWebAuthn verification. This introduces two distinct user concepts, explained during onboarding. It avoids designing a custom password-authentication protocol. Forgotten-passphrase decryption and all-passkeys-lost account recovery are explicitly unsupported.

## Argon2id in a dedicated worker and Web Crypto for AES-GCM

The KDF starts with RFC 9106's memory-constrained recommendation. `hash-wasm` supplies browser-compatible optimized Argon2id; Web Crypto supplies authenticated encryption. The Argon2id implementation is checked against an independently generated Node/OpenSSL known-answer result. AES-GCM is checked against a published known-answer primitive vector. Worker termination provides a concrete lock boundary while keeping the interface responsive. A WebAssembly-specific CSP allowance is used instead of general `unsafe-eval` for scripts.

The selected hash-wasm release is 4.12.0, published in 2024. It has an optimized implementation and passes the recorded checks, but this project does not assert that the package has undergone a recent independent audit. Review maintenance and alternatives again before real credential use.

## Random data key wrapped by the passphrase-derived key

Entries use an independent random key; changing the passphrase rewraps that key. This makes routine passphrase changes practical and keeps migration formats explicit. It does not revoke old copies. Full data-key rotation after a compromise is future work, not a property of rewrapping.

## Personal vault and one service process

One owner, one database, and one application service keep the authorization/key-distribution model reviewable. Team sharing, broad offline synchronization, and microservices would expand the scope without improving the initial evidence. Accepted writes are bounded and serialized per vault; two-device conflicts have a specific tested outcome.

## Separate maintenance privileges

Production application access is append-only on security events and must not be a database owner or elevated role. A separately scheduled maintenance command handles the 90-day deletion policy. The local development launcher deliberately uses its own development owner account so migrations, disposable test databases, and recovery exercises are reproducible. Those credentials/settings are unsuitable for public deployment.
