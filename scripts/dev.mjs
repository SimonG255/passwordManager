import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import 'dotenv/config';
import { startLocalDatabase } from './local-db.mjs';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://vaultline:local-development-only@127.0.0.1:54329/vaultline';
process.env.DATABASE_URL = databaseUrl;
const children = new Set();
let pg;
const launch = (script, args) => {
  const child = spawn(process.execPath, [resolve(script), ...args], {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
};
const setup = (script, args) =>
  new Promise((done, reject) => {
    const child = launch(script, args);
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? done() : reject(new Error(`Setup command exited ${code}`)),
    );
  });
const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1500 });
try {
  await client.connect();
  await client.end();
} catch {
  await client.end().catch(() => {});
  const url = new URL(databaseUrl);
  if (url.hostname !== '127.0.0.1' || url.port !== '54329')
    throw new Error('Configured PostgreSQL is unavailable. Start it before running dev.');
  pg = await startLocalDatabase();
}
if (!existsSync('node_modules/.prisma/client/index.js'))
  await setup('node_modules/prisma/build/index.js', ['generate']);
await setup('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
launch('node_modules/tsx/dist/cli.mjs', ['watch', 'apps/api/src/server.ts']);
launch('node_modules/vite/bin/vite.js', [
  '--config',
  'apps/web/vite.config.ts',
  'apps/web',
  '--host',
  '127.0.0.1',
]);
console.log(`\nVaultline → http://localhost:${process.env.WEB_PORT ?? 5173}\n`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const child of children) {
      if (process.platform === 'win32' && child.pid)
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      else child.kill('SIGTERM');
    }
    void (pg?.stop() ?? Promise.resolve()).then(() => {
      process.exitCode = 0;
    });
  });
