-- Provision vaultline_app as a LOGIN role with a secret set through your hosting
-- provider's credential controls. Apply this file as the migration owner after
-- migrations. Runtime must not own tables, inherit the migration role, be a
-- superuser, create databases/roles, or bypass RLS. This file contains no secret.
GRANT CONNECT ON DATABASE vaultline TO vaultline_app;
GRANT USAGE ON SCHEMA public TO vaultline_app;
GRANT SELECT, INSERT, UPDATE ON "Account" TO vaultline_app;
GRANT SELECT, INSERT, UPDATE ON "Passkey" TO vaultline_app;
GRANT SELECT, INSERT, DELETE ON "Challenge" TO vaultline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Session", "Entry" TO vaultline_app;
GRANT SELECT, INSERT, UPDATE ON "Vault" TO vaultline_app;
GRANT SELECT, INSERT ON "SecurityEvent" TO vaultline_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "SecurityEvent" FROM vaultline_app;
-- Use a separate maintenance role/job for the documented 90-day retention policy.
