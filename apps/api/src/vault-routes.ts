import type { FastifyInstance } from 'fastify';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  entryEnvelopeSchema,
  idSchema,
  keyEnvelopeSchema,
  MAX_ENTRIES,
  MAX_VAULT_BYTES,
  MAX_VAULT_WRITES,
  type EntryEnvelope,
} from '@vaultline/contracts';
import { authenticated, HttpError, recentlyVerified } from './security.js';

const version = z.number().int().min(1).max(1000000);
const json = (value: unknown) => value as Prisma.InputJsonValue;
// Updating the vault row acquires a lock before any entry writes/counts. All mutations
// use this boundary, so concurrent saves/imports cannot bypass capacity or key version checks.
async function lockVault(
  tx: Prisma.TransactionClient,
  accountId: string,
  keyVersion: number,
  cost = 1,
) {
  const found = await tx.vault.updateMany({
    where: { accountId, keyVersion, generation: { lte: MAX_VAULT_WRITES - cost } },
    data: { generation: { increment: cost } },
  });
  if (!found.count) {
    const current = await tx.vault.findUnique({ where: { accountId } });
    if (current && current.generation > MAX_VAULT_WRITES - cost)
      throw new HttpError(
        403,
        'This vault reached its write limit. Export an encrypted backup and restore it into a new vault.',
      );
    throw new HttpError(409, 'The vault key changed. Lock and unlock your vault again.');
  }
  return tx.vault.findUniqueOrThrow({ where: { accountId } });
}
async function checkSize(tx: Prisma.TransactionClient, vaultId: string) {
  const rows = await tx.$queryRaw<
    { bytes: bigint }[]
  >`SELECT COALESCE(SUM(octet_length("envelope"::text)), 0)::bigint AS bytes FROM "Entry" WHERE "vaultId" = ${vaultId}::uuid`;
  if (Number(rows[0].bytes) > MAX_VAULT_BYTES)
    throw new HttpError(
      400,
      'This vault reached its 10 MB encrypted storage limit. Shorten notes or remove an item before retrying.',
    );
}
export function registerVaultRoutes(app: FastifyInstance, db: PrismaClient) {
  app.post('/api/vault', async (request, reply) => {
    const session = authenticated(request);
    const envelope = keyEnvelopeSchema.parse(request.body);
    if (envelope.version !== 1) throw new HttpError(400, 'New vaults must start at version 1.');
    await db.$transaction([
      db.vault.create({
        data: { id: envelope.id, accountId: session.accountId, envelope: json(envelope) },
      }),
      db.securityEvent.create({
        data: { accountId: session.accountId, action: 'Encrypted vault created' },
      }),
    ]);
    reply.code(201);
    return { ok: true };
  });
  app.get('/api/vault', async (request) => {
    const session = authenticated(request);
    return db.$transaction(
      async (tx) => {
        const vault = await tx.vault.findUnique({ where: { accountId: session.accountId } });
        if (!vault) throw new HttpError(404, 'Create a vault first.');
        const entries = await tx.entry.findMany({
          where: { vaultId: vault.id },
          orderBy: { updatedAt: 'desc' },
        });
        return {
          vault: vault.envelope,
          keyVersion: vault.keyVersion,
          generation: vault.generation,
          entries: entries.map((entry) => ({
            ...(entry.envelope as unknown as EntryEnvelope),
            updatedAt: entry.updatedAt,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  });
  app.put('/api/entries/:id', async (request) => {
    const session = authenticated(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const { entry, expectedRevision, keyVersion } = z
      .strictObject({
        entry: entryEnvelopeSchema,
        expectedRevision: z.number().int().min(0).max(999999),
        keyVersion: version,
      })
      .parse(request.body);
    if (entry.id !== id || entry.revision !== expectedRevision + 1)
      throw new HttpError(400, 'Invalid entry revision.');
    return db.$transaction(async (tx) => {
      const vault = await lockVault(tx, session.accountId, keyVersion);
      if (entry.vaultId !== vault.id) throw new HttpError(404, 'Entry not found.');
      const current = await tx.entry.findUnique({ where: { id } });
      if (current && current.vaultId !== vault.id) throw new HttpError(404, 'Entry not found.');
      // Exact envelope replay is safe: reusing the same ciphertext for a retry is
      // different from performing another encryption with the same IV.
      if (
        current &&
        current.revision === entry.revision &&
        isDeepStrictEqual(current.envelope, json(entry))
      )
        return { ok: true, generation: vault.generation };
      if ((current?.revision ?? 0) !== expectedRevision)
        throw new HttpError(
          409,
          'This entry changed in another tab or device. Reload the latest version before saving.',
        );
      if (!current && (await tx.entry.count({ where: { vaultId: vault.id } })) >= MAX_ENTRIES)
        throw new HttpError(400, 'This vault has reached its 1,000-entry limit.');
      if (current)
        await tx.entry.update({
          where: { id },
          data: { envelope: json(entry), revision: entry.revision },
        });
      else
        await tx.entry.create({
          data: { id, vaultId: vault.id, revision: entry.revision, envelope: json(entry) },
        });
      await checkSize(tx, vault.id);
      await tx.securityEvent.create({
        data: {
          accountId: session.accountId,
          action: current ? 'Encrypted entry updated' : 'Encrypted entry created',
        },
      });
      return { ok: true, generation: vault.generation };
    });
  });
  app.delete('/api/entries/:id', async (request) => {
    const session = authenticated(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const { expectedRevision, keyVersion } = z
      .strictObject({ expectedRevision: version, keyVersion: version })
      .parse(request.body);
    return db.$transaction(async (tx) => {
      const vault = await lockVault(tx, session.accountId, keyVersion);
      const entry = await tx.entry.findFirst({ where: { id, vaultId: vault.id } });
      if (!entry) throw new HttpError(404, 'Entry not found.');
      if (entry.revision !== expectedRevision)
        throw new HttpError(409, 'This entry changed. Reload before deleting.');
      await tx.entry.delete({ where: { id } });
      await tx.securityEvent.create({
        data: { accountId: session.accountId, action: 'Encrypted entry deleted' },
      });
      return { ok: true };
    });
  });
  app.post('/api/vault/import', { bodyLimit: 20 * 1024 * 1024 }, async (request) => {
    const session = authenticated(request);
    const { entries, keyVersion, operationId } = z
      .strictObject({
        entries: z.array(entryEnvelopeSchema).min(1).max(MAX_ENTRIES),
        keyVersion: version,
        operationId: idSchema,
      })
      .parse(request.body);
    if (
      new Set(entries.map((entry) => entry.id)).size !== entries.length ||
      entries.some((entry) => entry.revision !== 1)
    )
      throw new HttpError(400, 'Invalid import manifest.');
    return db.$transaction(
      async (tx) => {
        const vault = await lockVault(tx, session.accountId, keyVersion, entries.length);
        if (entries.some((entry) => entry.vaultId !== vault.id))
          throw new HttpError(400, 'Imported records must be encrypted for this vault.');
        const existing = await tx.entry.findMany({
          where: { id: { in: entries.map((entry) => entry.id) } },
        });
        if (
          existing.length === entries.length &&
          existing.every(
            (saved) =>
              saved.vaultId === vault.id &&
              entries.some(
                (entry) => entry.id === saved.id && isDeepStrictEqual(saved.envelope, json(entry)),
              ),
          )
        )
          return { ok: true, imported: entries.length, operationId };
        if (existing.length) throw new HttpError(409, 'An imported record already exists.');
        if ((await tx.entry.count({ where: { vaultId: vault.id } })) + entries.length > MAX_ENTRIES)
          throw new HttpError(400, 'Import would exceed the 1,000-entry limit.');
        await tx.entry.createMany({
          data: entries.map((entry) => ({
            id: entry.id,
            vaultId: vault.id,
            revision: 1,
            envelope: json(entry),
          })),
        });
        await checkSize(tx, vault.id);
        await tx.securityEvent.create({
          data: {
            accountId: session.accountId,
            action: `Encrypted backup imported (${entries.length} entries)`,
          },
        });
        return { ok: true, imported: entries.length, operationId };
      },
      { timeout: 15000 },
    );
  });
  app.put('/api/vault/key', async (request) => {
    const session = recentlyVerified(request);
    const { envelope, expectedVersion } = z
      .strictObject({ envelope: keyEnvelopeSchema, expectedVersion: version })
      .parse(request.body);
    if (envelope.version !== expectedVersion + 1) throw new HttpError(400, 'Invalid key version.');
    await db.$transaction(async (tx) => {
      const changed = await tx.vault.updateMany({
        where: { id: envelope.id, accountId: session.accountId, keyVersion: expectedVersion },
        data: {
          envelope: json(envelope),
          keyVersion: envelope.version,
          generation: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new HttpError(409, 'The vault key changed. Lock and unlock before trying again.');
      await tx.securityEvent.create({
        data: {
          accountId: session.accountId,
          action: 'Master passphrase changed (vault key rewrapped)',
        },
      });
    });
    return { ok: true };
  });
}
