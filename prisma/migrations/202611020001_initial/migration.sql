CREATE TABLE "Account" (
  "id" UUID PRIMARY KEY, "handle" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Passkey" (
  "id" TEXT PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "publicKey" BYTEA NOT NULL, "counter" BIGINT NOT NULL DEFAULT 0, "transports" TEXT[], "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Passkey_accountId_idx" ON "Passkey"("accountId");
CREATE TABLE "Challenge" (
  "id" TEXT PRIMARY KEY, "value" TEXT NOT NULL, "kind" TEXT NOT NULL, "handle" TEXT, "accountId" TEXT, "sessionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Challenge_expiresAt_idx" ON "Challenge"("expiresAt");
CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "csrf" TEXT NOT NULL, "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "device" TEXT NOT NULL
);
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "Vault" (
  "id" UUID PRIMARY KEY, "accountId" UUID NOT NULL UNIQUE REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "envelope" JSONB NOT NULL, "keyVersion" INTEGER NOT NULL DEFAULT 1, "generation" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Entry" (
  "id" UUID PRIMARY KEY, "vaultId" UUID NOT NULL REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL, "envelope" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Entry_revision_positive" CHECK ("revision" BETWEEN 1 AND 1000000)
);
CREATE INDEX "Entry_vaultId_idx" ON "Entry"("vaultId");
CREATE TABLE "SecurityEvent" (
  "id" UUID PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "action" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SecurityEvent_accountId_createdAt_idx" ON "SecurityEvent"("accountId", "createdAt");
