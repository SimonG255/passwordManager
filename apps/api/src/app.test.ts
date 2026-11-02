import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createVault, encryptEntry, type UnlockedVault } from '@vaultline/vault-crypto';
import type { EntryEnvelope } from '@vaultline/contracts';
import { buildApp } from './app';
import { connectDatabase } from './database';
import { hash, token } from './security';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://vaultline:local-development-only@127.0.0.1:54329/vaultline_test';
if (!new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('Integration tests require a database ending in _test.');
let db: PrismaClient;
let app: FastifyInstance;
const accounts: string[] = [];
let first: { cookie: string; csrf: string; accountId: string; sessionId: string };
let second: typeof first;
let vault: UnlockedVault;
let entry: EntryEnvelope;
const origin = 'http://localhost:5173';
async function seed() {
  const account = await db.account.create({
    data: { handle: `test_${crypto.randomUUID().slice(0, 12)}` },
  });
  accounts.push(account.id);
  const raw = token();
  const csrf = token();
  const sessionId = hash(raw);
  await db.session.create({
    data: {
      id: sessionId,
      accountId: account.id,
      csrf,
      expiresAt: new Date(Date.now() + 3600000),
      device: 'Integration test',
    },
  });
  return { cookie: `vl_session=${raw}`, csrf, accountId: account.id, sessionId };
}
function request(method: 'POST' | 'PUT' | 'DELETE', url: string, payload: unknown, user = first) {
  return app.inject({
    method,
    url,
    payload: payload as Record<string, unknown>,
    headers: {
      cookie: user.cookie,
      origin,
      'x-csrf-token': user.csrf,
      'content-type': 'application/json',
    },
  });
}
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe', windowsHide: true },
  );
  db = connectDatabase(databaseUrl);
  app = await buildApp(
    db,
    { origin, rpId: 'localhost', port: 3001, host: '127.0.0.1', production: false, databaseUrl },
    false,
  );
  first = await seed();
  second = await seed();
  vault = await createVault('fictional integration test passphrase');
  entry = await encryptEntry(vault, {
    title: 'Synthetic private title',
    website: '',
    username: 'private-test-user',
    password: 'Synthetic-Private-Secret!123',
    notes: 'private-test-note',
    category: 'login',
    favorite: false,
  });
});
afterAll(async () => {
  await app?.close();
  if (db) {
    await db.account.deleteMany({ where: { id: { in: accounts } } });
    await db.$disconnect();
  }
});
describe('API security and consistency', () => {
  it('requires authentication and sends no-store headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/vault' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects untrusted origins and missing or malformed CSRF tokens', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/vault',
      payload: vault.envelope,
      headers: {
        cookie: first.cookie,
        origin: 'https://untrusted.example',
        'x-csrf-token': first.csrf,
      },
    });
    expect(response.statusCode).toBe(403);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/vault',
      payload: vault.envelope,
      headers: { cookie: first.cookie, origin },
    });
    expect(missing.statusCode).toBe(403);
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/vault',
      payload: vault.envelope,
      headers: { cookie: first.cookie, origin, 'x-csrf-token': 'é'.repeat(first.csrf.length) },
    });
    expect(malformed.statusCode).toBe(403);
  });
  it('creates one owned encrypted vault and record without plaintext in storage', async () => {
    expect((await request('POST', '/api/vault', vault.envelope)).statusCode).toBe(201);
    const response = await request('PUT', `/api/entries/${entry.id}`, {
      entry,
      expectedRevision: 0,
      keyVersion: 1,
    });
    expect(response.statusCode).toBe(200);
    const stored = await db.entry.findUniqueOrThrow({ where: { id: entry.id } });
    const text = JSON.stringify(stored);
    expect(text).not.toContain('Synthetic private title');
    expect(text).not.toContain('Synthetic-Private-Secret');
    expect(text).not.toContain('private-test-user');
    expect(text).not.toContain('private-test-note');
  });
  it('accepts an exact lost-response retry without duplicating a record', async () => {
    expect(
      (
        await request('PUT', `/api/entries/${entry.id}`, {
          entry,
          expectedRevision: 0,
          keyVersion: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(await db.entry.count({ where: { id: entry.id } })).toBe(1);
  });
  it('isolates cross-account reads, writes, deletions and session revocations', async () => {
    const otherVault = await createVault('second fictional integration passphrase');
    expect((await request('POST', '/api/vault', otherVault.envelope, second)).statusCode).toBe(201);
    const own = await app.inject({
      method: 'GET',
      url: '/api/vault',
      headers: { cookie: second.cookie },
    });
    expect(own.json().entries).toEqual([]);
    expect(
      (
        await request(
          'PUT',
          `/api/entries/${entry.id}`,
          { entry, expectedRevision: 0, keyVersion: 1 },
          second,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          'DELETE',
          `/api/entries/${entry.id}`,
          { expectedRevision: 1, keyVersion: 1 },
          second,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await request('DELETE', `/api/sessions/${first.sessionId}`, {}, second)).statusCode,
    ).toBe(404);
  });
  it('lets only one concurrent edit of a revision succeed', async () => {
    const a = await encryptEntry(
      vault,
      {
        title: 'Edit A',
        website: '',
        username: '',
        password: '',
        notes: '',
        favorite: false,
        category: 'note',
      },
      entry.id as `${string}-${string}-${string}-${string}-${string}`,
      2,
    );
    const b = await encryptEntry(
      vault,
      {
        title: 'Edit B',
        website: '',
        username: '',
        password: '',
        notes: '',
        favorite: false,
        category: 'note',
      },
      entry.id as `${string}-${string}-${string}-${string}-${string}`,
      2,
    );
    const responses = await Promise.all([
      request('PUT', `/api/entries/${entry.id}`, { entry: a, expectedRevision: 1, keyVersion: 1 }),
      request('PUT', `/api/entries/${entry.id}`, { entry: b, expectedRevision: 1, keyVersion: 1 }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect((await db.entry.findUniqueOrThrow({ where: { id: entry.id } })).revision).toBe(2);
  });
  it('rejects stale key versions and malformed import manifests atomically', async () => {
    const before = await db.entry.count({ where: { vaultId: vault.envelope.id } });
    expect(
      (
        await request('PUT', `/api/entries/${entry.id}`, {
          entry,
          expectedRevision: 0,
          keyVersion: 2,
        })
      ).statusCode,
    ).toBe(409);
    const valid = await encryptEntry(vault, {
      title: 'Valid import',
      website: '',
      username: '',
      password: '',
      notes: '',
      favorite: false,
      category: 'note',
    });
    const invalid = { ...valid, id: crypto.randomUUID(), vaultId: crypto.randomUUID() };
    expect(
      (
        await request('POST', '/api/vault/import', {
          entries: [valid, invalid],
          keyVersion: 1,
          operationId: crypto.randomUUID(),
        })
      ).statusCode,
    ).toBe(400);
    expect(await db.entry.count({ where: { vaultId: vault.envelope.id } })).toBe(before);
  });
  it('imports records transactionally and safely retries the identical batch', async () => {
    const incoming = await encryptEntry(vault, {
      title: 'Restored note',
      website: '',
      username: '',
      password: '',
      notes: 'fictional',
      favorite: false,
      category: 'note',
    });
    const payload = { entries: [incoming], keyVersion: 1, operationId: crypto.randomUUID() };
    expect((await request('POST', '/api/vault/import', payload)).statusCode).toBe(200);
    expect((await request('POST', '/api/vault/import', payload)).statusCode).toBe(200);
    expect(await db.entry.count({ where: { id: incoming.id } })).toBe(1);
  });
  it('rejects invalid and replayed authentication ceremonies', async () => {
    const setup = await request('POST', '/api/auth/login/options', {});
    const cookies = setup.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
    const headers = { cookie: `${first.cookie}; ${cookies}`, origin, 'x-csrf-token': first.csrf };
    const payload = { response: { id: 'fictional-invalid-id' } };
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/login/verify', payload, headers }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/login/verify', payload, headers }))
        .statusCode,
    ).toBe(400);
  });
  it('requires recent verification to enroll a passkey', async () => {
    await db.session.update({
      where: { id: first.sessionId },
      data: { verifiedAt: new Date(Date.now() - 10 * 60000) },
    });
    expect((await request('POST', '/api/auth/passkeys/options', {})).statusCode).toBe(403);
  });
  it('rejects revoked and idle-expired sessions', async () => {
    await db.session.update({
      where: { id: second.sessionId },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60000) },
    });
    expect(
      (await app.inject({ method: 'GET', url: '/api/vault', headers: { cookie: second.cookie } }))
        .statusCode,
    ).toBe(401);
    await db.session.delete({ where: { id: first.sessionId } });
    expect(
      (await app.inject({ method: 'GET', url: '/api/vault', headers: { cookie: first.cookie } }))
        .statusCode,
    ).toBe(401);
  });
});
