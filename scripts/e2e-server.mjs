import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { startLocalDatabase } from './local-db.mjs';

if (!new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
  throw new Error('Browser tests require an isolated _test database.');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 1500,
});
let local;
try {
  await client.connect();
  await client.end();
} catch {
  await client.end().catch(() => {});
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '54329')
    throw new Error('Test PostgreSQL is unavailable.');
  local = await startLocalDatabase();
}
const run = (file, args, cwd = process.cwd()) =>
  execFileSync(process.execPath, [resolve(file), ...args], {
    cwd,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
run('node_modules/prisma/build/index.js', ['generate']);
run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
run('node_modules/vite/bin/vite.js', ['build'], resolve('apps/web'));
run('node_modules/tsup/dist/cli-default.js', []);
await import('../dist/api/server.js');
if (local) process.once('SIGINT', () => void local.stop());
