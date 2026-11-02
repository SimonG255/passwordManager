import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';

const config = loadConfig();
const db = connectDatabase(config.databaseUrl);
const app = await buildApp(db, config);
await db.$connect();
if (config.production) {
  const roles = await db.$queryRaw<
    { elevated: boolean }[]
  >`SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS elevated FROM pg_roles WHERE rolname = current_user`;
  const grants = await db.$queryRaw<
    { mutable: boolean }[]
  >`SELECT (has_table_privilege(current_user, '"SecurityEvent"', 'UPDATE') OR has_table_privilege(current_user, '"SecurityEvent"', 'DELETE')) AS mutable`;
  if (roles[0]?.elevated || grants[0]?.mutable)
    throw new Error(
      'Production requires a restricted runtime database role with append-only security-event access. See docs/runbook.md.',
    );
}
await app.listen({ port: config.port, host: config.host });
const retention = setInterval(
  () => {
    void db
      .$transaction([
        db.challenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
        db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
        ...(!config.production
          ? [
              db.securityEvent.deleteMany({
                where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
              }),
            ]
          : []),
      ])
      .catch(() => app.log.error({ category: 'retention' }, 'cleanup failed'));
  },
  60 * 60 * 1000,
).unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    clearInterval(retention);
    void app
      .close()
      .then(() => db.$disconnect())
      .then(() => {
        process.exitCode = 0;
      });
  });
