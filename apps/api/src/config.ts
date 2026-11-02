import 'dotenv/config';
import { z } from 'zod';

export type Config = {
  origin: string;
  rpId: string;
  port: number;
  host: string;
  production: boolean;
  databaseUrl: string;
};
export function loadConfig(): Config {
  const production = process.env.NODE_ENV === 'production';
  const schema = z.object({
    DATABASE_URL: z.string().startsWith('postgresql://'),
    APP_ORIGIN: z.url(),
    RP_ID: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().default('127.0.0.1'),
  });
  const env = schema.parse(
    production
      ? process.env
      : {
          DATABASE_URL: 'postgresql://vaultline:local-development-only@127.0.0.1:54329/vaultline',
          APP_ORIGIN: 'http://localhost:5173',
          RP_ID: 'localhost',
          ...process.env,
        },
  );
  const url = new URL(env.APP_ORIGIN);
  if (
    url.origin !== env.APP_ORIGIN ||
    (url.hostname !== env.RP_ID && !url.hostname.endsWith(`.${env.RP_ID}`))
  )
    throw new Error('APP_ORIGIN must be an origin matching RP_ID.');
  if (production && url.protocol !== 'https:') throw new Error('Production requires HTTPS.');
  return {
    origin: env.APP_ORIGIN,
    rpId: env.RP_ID,
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    production,
  };
}
