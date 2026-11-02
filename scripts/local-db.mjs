import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export async function startLocalDatabase() {
  const directory = resolve('.local/postgres');
  mkdirSync(resolve('.local'), { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: directory,
    port: 54329,
    user: 'vaultline',
    password: 'local-development-only',
    persistent: true,
    authMethod: 'scram-sha-256',
    postgresFlags: ['-h', '127.0.0.1'],
    autoRehydrateSymlinks: true,
    onLog: (message) => {
      if (process.env.LOCAL_DB_VERBOSE === '1' || String(message).includes('FATAL'))
        console.log(String(message));
    },
    onError: () => {
      process.stderr.write('Local PostgreSQL startup failed. Check port 54329.\n');
    },
  });
  if (!existsSync(resolve(directory, 'PG_VERSION'))) await pg.initialise();
  let stop = () => pg.stop();
  if (process.platform === 'win32') {
    // pg_ctl creates a restricted child token on Windows, which also supports
    // development shells launched by an administrator. It launches invisibly.
    const { pg_ctl } = await import('@embedded-postgres/windows-x64');
    const run = (args) =>
      new Promise((done, reject) => {
        const child = spawn(pg_ctl, args, { windowsHide: true, stdio: 'ignore' });
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0
            ? done()
            : reject(new Error('PostgreSQL launcher failed. See .local/postgres.log.')),
        );
      });
    await run([
      'start',
      '-w',
      '-D',
      directory,
      '-l',
      resolve('.local/postgres.log'),
      '-o',
      '-p 54329 -h 127.0.0.1',
    ]);
    stop = async () => {
      await run(['stop', '-w', '-D', directory, '-m', 'fast']);
    };
  } else await pg.start();
  const client = pg.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  for (const name of ['vaultline', 'vaultline_test']) {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
    if (!found.rows.length) await client.query(`CREATE DATABASE ${name}`);
  }
  await client.end();
  console.log('Local PostgreSQL ready on 127.0.0.1:54329 (development only).');
  return { stop };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pg = await startLocalDatabase();
  const keepalive = setInterval(() => {}, 60000);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      clearInterval(keepalive);
      void pg.stop().then(() => {
        process.exitCode = 0;
      });
    });
}
