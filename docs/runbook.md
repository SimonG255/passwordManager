# Operating Vaultline

## Local development

1. Install Node 24 and run `npm.cmd install` (`npm install` on macOS/Linux).
2. Run `npm.cmd run dev` and open `http://localhost:5173`.
3. The launcher reuses a reachable configured database or starts an isolated development PostgreSQL instance on `127.0.0.1:54329`. It applies checked-in migrations before starting the API.
4. If the API is unavailable, the account screen offers retry and the separate fictional demo. Normal accounts require the API.

Do not delete `.local/postgres` to troubleshoot a service failure: it holds persistent local application data. Stop the owning process cleanly, check `.local/postgres.log`, confirm ports, and restart. The Windows launcher uses `pg_ctl` so PostgreSQL can create a restricted child token even when the development shell is elevated. It does not create a Windows account or weaken host security settings.

Use `localhost` in the browser. `http://127.0.0.1:5173` is a different origin and will fail the configured origin checks. Passkeys are scoped to the RP ID; changing the deployed hostname requires a credential-migration strategy or fresh credentials.

## Production deployment

The container files are provided but have not been run here because Docker is unavailable. No public hosting provider, domain, paid infrastructure, or live TLS deployment was configured.

1. Provision a private PostgreSQL 18 database and stable HTTPS hostname. Keep database access restricted to the service, migration runner, and authorized maintenance/backup jobs.
2. Build with `npm ci` and `npm run build`, or use the Dockerfile. The `build` target includes migration tooling; the `runtime` target runs the built server as the unprivileged `node` OS user.
3. Run `prisma migrate deploy` with the migration-owner connection string. Keep this credential out of the runtime service. Inspect every migration; do not use `db push` as a production migration strategy.
4. Provision a separate `vaultline_app` LOGIN role through the database/provider's credential controls. It must not own application tables, be superuser, create roles/databases, bypass RLS, or inherit the migration owner. Set its secret outside source control. Apply `prisma/runtime-grants.sql` as the migration owner; adjust the database name if it differs from `vaultline`.
5. Configure the runtime environment using `.env.production.example`: `NODE_ENV=production`, `DATABASE_URL` for the restricted role, exact `APP_ORIGIN=https://your-stable-host`, matching `RP_ID`, `HOST`, and `PORT`. Do not put any master passphrase or vault data key into server configuration.
6. Terminate TLS at the hosting proxy and forward the application over a private/local interface. The application enforces HTTPS in its configured origin and sets Secure `__Host-` session cookies in production. Ensure the browser loads the app and API from that one origin. Expose only the proxy publicly.
7. Schedule `npm run maintenance` daily in a separate maintenance-capable image/job with `MAINTENANCE_DATABASE_URL`. This role needs event DELETE privileges; the runtime role does not. Development cleanup is automatic hourly, while production event deletion is deliberately separated from the application. Event listing is always limited to the last 90 days.
8. Check `/api/health` and `/api/ready`, then perform actual passkey enrollment/sign-in, vault unlock, save, lock, and backup restoration from the deployed origin before sharing a URL.

The production server checks its database role and refuses elevated privileges or UPDATE/DELETE access to `SecurityEvent`. The provided Compose stack deliberately uses public development credentials, HTTP localhost, and development mode; it is for local use.

Use one instance for this prototype. Distributed deployments need shared rate limiting, measured capacity, a tested migration/release strategy, and a separate availability design. Do not silently enable broad proxy trust to obtain client IPs: configure trusted proxy ranges before adopting forwarded-address rate limits.

## Failure response

| Symptom                                | Response                                                                                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database unavailable                   | Readiness fails and API operations return a generic 503. Restore connectivity before retrying. The UI must not claim an unconfirmed write succeeded.                                                                                     |
| Save response lost after commit        | Retry without editing the draft. The cached envelope is accepted idempotently. If the draft changed, the revision check may require loading the saved version.                                                                           |
| 409 conflict                           | Preserve the user's draft. Choose the explicit discard/reload action to load the newer version, then make a deliberate edit.                                                                                                             |
| Master passphrase changed elsewhere    | Lock and unlock using the current passphrase. Stale key-envelope versions cannot write.                                                                                                                                                  |
| Passphrase-change response unconfirmed | Reconnect and refresh. The committed envelope is authoritative; try the newly chosen passphrase. Historical exports still use the phrase at their creation time.                                                                         |
| Authentication expired/revoked         | The client clears decrypted UI state and returns to sign-in. Sign in with a registered passkey, then unlock locally.                                                                                                                     |
| New passkey enrollment rejected        | Reauthenticate using the current account's passkey, then enroll within five minutes. Use a distinct backup authenticator.                                                                                                                |
| Migration failure                      | Stop promotion, preserve the previous application image, inspect the failure as the migration owner, and restore a tested backup if needed. Do not edit an applied migration's checksum or automatically run destructive reset commands. |
| Clipboard copied                       | Clipboard data is shared with other apps. This prototype makes no promise of automatic clearing.                                                                                                                                         |

Structured logs include route templates, method, status, and elapsed time. They exclude bodies, raw session tokens, passkey responses, decrypted fields, passphrases, and query payloads. Monitor error rates, latency, readiness, and storage capacity using your hosting system. A health endpoint alone is not proof that user authentication or decryption works.

## Backups and restoration

Application exports are encrypted snapshots. Restore them using their original master passphrase into an unlocked target vault; the browser verifies the complete manifest, decrypts, re-encrypts under the target key with new IDs, and submits an atomic batch. Existing target entries are preserved. Empty exports are valid but add no entries. Keep files and passphrases separately.

Database backups preserve account/passkey public data, sessions, event metadata, and encrypted entry/key envelopes. Protect them even though entry fields remain encrypted. Use PostgreSQL 18 `pg_dump --format=custom --no-owner --no-privileges` with credentials supplied through the provider's secret controls or a protected `PGPASSFILE`, not command-line passwords. Restore into a fresh database using `pg_restore --no-owner --no-privileges --exit-on-error`, rerun runtime grants, verify migrations and readiness, and test real unlocks before redirecting traffic. Prefer invalidating restored sessions after incident recovery.

The implemented `npm run test:recovery` drill uses precisely named disposable local databases only. It creates a synthetic vault, dumps it, destroys its source database, restores the archive, verifies all decrypted entry fields, and removes its disposable databases. The recorded [evidence](evidence/recovery-drill.json) is an actual completed run. The dump is retained only under ignored `.local/recovery`.

The embedded server package omits `pg_dump`/`pg_restore`. On a fresh Windows checkout, obtain PostgreSQL 18 client tools from the official [EDB binaries page](https://www.enterprisedb.com/download-postgresql-binaries), extract the binaries locally, and set `PG_BIN` to their directory. No global installation is required. This workspace already has those tools in `.local/tools/postgresql/bin`.

The master passphrase is not recoverable. All registered passkeys lost means no account-access recovery in version 1; a prior encrypted export and its passphrase can still be restored to a new account. Passphrase rewrapping is not compromise recovery: historical ciphertext remains decryptable with old credentials. Full data-key rotation needs a separate design.

## Updating dependencies

Use `npm ci` to reproduce the checked-in lockfile. Review direct upgrades and transitive security overrides together; then run type checking, linting, unit/integration tests, the production browser suite, and `npm audit`. The current overrides keep `glob`, `minimatch`, and `esbuild` on patched releases; these were verified through the implemented checks. Rerun the recovery drill when changing database/storage formats or migration behavior.

The GitHub Actions workflow runs source checks, PostgreSQL integration tests, packaged browser tests, dependency auditing, and Gitleaks. It has not been executed on GitHub in this workspace. Before real credential use, commission an independent review and manually verify physical passkeys on the intended device/browser set.
