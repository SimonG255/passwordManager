import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { registerSecurity, HttpError } from './security.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerVaultRoutes } from './vault-routes.js';

export async function buildApp(db: PrismaClient, config: Config, logger = true) {
  const app = Fastify({
    logger: logger ? { level: 'info' } : false,
    logController: new Fastify.LogController({ disableRequestLogging: true }),
    bodyLimit: 128 * 1024,
    requestTimeout: 20000,
  });
  await app.register(cookie);
  await app.register(helmet, {
    global: true,
    hsts: config.production ? undefined : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
  });
  await app.register(rateLimit, { max: 180, timeWindow: '1 minute' });
  registerSecurity(app, db, config);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({ error: error.issues[0]?.message ?? 'Invalid input.' });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return reply.code(409).send({ error: 'That account, vault, or credential already exists.' });
    if (
      typeof error === 'object' &&
      error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode < 500
    )
      return reply.code(error.statusCode).send({
        error:
          error.statusCode === 429
            ? 'Too many requests. Please wait and try again.'
            : 'The request could not be processed.',
      });
    // Never log errors containing Prisma queries, request bodies, or credentials.
    app.log.error(
      { category: error instanceof Prisma.PrismaClientKnownRequestError ? 'database' : 'internal' },
      'request failed',
    );
    return reply.code(503).send({
      error: 'The service is temporarily unavailable. Your changes have not been confirmed.',
    });
  });
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/ready', async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  });
  registerAuthRoutes(app, db, config);
  registerVaultRoutes(app, db);
  const webRoot = resolve('apps/web/dist');
  if (existsSync(webRoot)) {
    await app.register(staticFiles, {
      root: webRoot,
      prefix: '/',
      index: 'index.html',
      cacheControl: false,
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/'))
        return reply.code(404).send({ error: 'Route not found.' });
      reply.header('Cache-Control', 'no-store');
      return reply.sendFile('index.html');
    });
  }
  return app;
}
