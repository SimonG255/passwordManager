import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { Client } from 'pg';
import type { PrismaClient } from '@prisma/client';
import { connectDatabase } from '../apps/api/src/database';
import { createVault, decryptEntry, encryptEntry, unlockVault } from '@vaultline/vault-crypto';

const base = new URL(
  process.env.TEST_DATABASE_URL ??
    'postgresql://vaultline:local-development-only@127.0.0.1:54329/vaultline_test',
);
if (base.hostname !== '127.0.0.1' || base.port !== '54329' || !base.pathname.endsWith('_test'))
  throw new Error(
    'The recovery drill only runs against the isolated local PostgreSQL test service.',
  );
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const names = {
  source: `vaultline_drill_source_${suffix}`,
  target: `vaultline_drill_restore_${suffix}`,
};
const adminUrl = new URL(base);
adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.href });
const connection = (name: string) => {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.href;
};
const checkedName = (name: string) => {
  if (!/^vaultline_drill_(source|restore)_[a-f0-9]{12}$/.test(name))
    throw new Error('Invalid disposable database name.');
  return `"${name}"`;
};
let source: PrismaClient | undefined;
let restored: PrismaClient | undefined;
const started = performance.now();
const phrase = 'fictional recovery drill master passphrase';
const fields = {
  title: 'Verified recovery record',
  website: 'https://example.com',
  username: 'recovery@example.com',
  password: 'Synthetic-Recovery-Secret!123',
  notes: 'This is fictional recovery-drill data.',
  favorite: true,
  category: 'login' as const,
};
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${checkedName(names.source)}`);
  await admin.query(`CREATE DATABASE ${checkedName(names.target)}`);
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      env: { ...process.env, DATABASE_URL: connection(names.source) },
      stdio: 'pipe',
      windowsHide: true,
    },
  );
  source = connectDatabase(connection(names.source));
  const vault = await createVault(phrase);
  const entry = await encryptEntry(vault, fields);
  const account = await source.account.create({ data: { handle: `recovery_${suffix}` } });
  await source.vault.create({
    data: { id: vault.envelope.id, accountId: account.id, envelope: vault.envelope },
  });
  await source.entry.create({
    data: { id: entry.id, vaultId: entry.vaultId, revision: 1, envelope: entry },
  });
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const binaries = (await import(`@embedded-postgres/${platform}-${process.arch}`)) as {
    postgres: string;
  };
  const localTools = resolve('.local/tools/postgresql/bin');
  const bin =
    process.env.PG_BIN ?? (existsSync(localTools) ? localTools : dirname(binaries.postgres));
  const extension = process.platform === 'win32' ? '.exe' : '';
  if (
    !existsSync(resolve(bin, `pg_dump${extension}`)) ||
    !existsSync(resolve(bin, `pg_restore${extension}`))
  )
    throw new Error(
      'Install PostgreSQL 18 client tools and set PG_BIN to their directory. See docs/runbook.md.',
    );
  mkdirSync(resolve('.local/recovery'), { recursive: true });
  const file = resolve('.local/recovery/drill.dump');
  const credentials = [
    '--host',
    base.hostname,
    '--port',
    base.port,
    '--username',
    decodeURIComponent(base.username),
  ];
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(base.password) };
  execFileSync(
    resolve(bin, `pg_dump${extension}`),
    [
      ...credentials,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      file,
      names.source,
    ],
    { env, stdio: 'pipe', windowsHide: true },
  );
  await source.$disconnect();
  source = undefined;
  // Destroy only the precisely named synthetic source database, proving restoration
  // is independent of the live source. Never target the user's actual vault database.
  await admin.query(`DROP DATABASE ${checkedName(names.source)} WITH (FORCE)`);
  execFileSync(
    resolve(bin, `pg_restore${extension}`),
    [
      ...credentials,
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      '--dbname',
      names.target,
      file,
    ],
    { env, stdio: 'pipe', windowsHide: true },
  );
  restored = connectDatabase(connection(names.target));
  const savedVault = await restored.vault.findUniqueOrThrow({ where: { id: vault.envelope.id } });
  const savedEntry = await restored.entry.findUniqueOrThrow({ where: { id: entry.id } });
  const unlocked = await unlockVault(phrase, savedVault.envelope);
  const actual = await decryptEntry(unlocked, savedEntry.envelope);
  const { id: _id, revision: _revision, ...actualFields } = actual;
  if (!isDeepStrictEqual(actualFields, fields)) throw new Error('Restored fields did not match.');
  unlocked.rawKey.fill(0);
  vault.rawKey.fill(0);
  const evidence = {
    performedAt: new Date().toISOString(),
    database: 'PostgreSQL 18',
    durationMs: Math.round(performance.now() - started),
    sourceDestroyedBeforeRestore: true,
    restoredEncryptedEntries: 1,
    decryptedFieldsVerified: Object.keys(fields),
    disposableDatabasesOnly: true,
    result: 'passed',
  };
  mkdirSync('docs/evidence', { recursive: true });
  writeFileSync('docs/evidence/recovery-drill.json', `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Recovery drill passed: source removed, backup restored, all encrypted entry fields verified (${evidence.durationMs} ms).`,
  );
} finally {
  await source?.$disconnect();
  await restored?.$disconnect();
  for (const name of Object.values(names))
    await admin.query(`DROP DATABASE IF EXISTS ${checkedName(name)} WITH (FORCE)`).catch(() => {});
  await admin.end();
}
