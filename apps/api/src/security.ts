import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, Session } from '@prisma/client';
import type { Config } from './config.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: Session | null;
  }
}
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const cookieNames = (config: Config) => ({
  session: config.production ? '__Host-vl_session' : 'vl_session',
  csrf: config.production ? '__Host-vl_csrf' : 'vl_csrf',
  flow: config.production ? '__Host-vl_flow' : 'vl_flow',
});
export const cookieOptions = (config: Config) => ({
  httpOnly: true,
  secure: config.production,
  sameSite: 'strict' as const,
  path: '/',
});
function equals(a: unknown, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function authenticated(request: FastifyRequest): Session {
  if (!request.auth) throw new HttpError(401, 'Your session has expired. Sign in again.');
  return request.auth;
}
export function recentlyVerified(request: FastifyRequest): Session {
  const session = authenticated(request);
  if (Date.now() - session.verifiedAt.getTime() > 5 * 60 * 1000)
    throw new HttpError(403, 'Verify your passkey again before changing security settings.');
  return session;
}
export function registerSecurity(app: FastifyInstance, db: PrismaClient, config: Config) {
  const names = cookieNames(config);
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    const raw = request.cookies[names.session];
    if (raw && raw.length <= 100) {
      const session = await db.session.findUnique({ where: { id: hash(raw) } });
      if (
        session &&
        session.expiresAt.getTime() > Date.now() &&
        Date.now() - session.lastSeenAt.getTime() < 30 * 60 * 1000
      ) {
        request.auth = session;
        if (Date.now() - session.lastSeenAt.getTime() > 60000)
          await db.session.updateMany({
            where: { id: session.id },
            data: { lastSeenAt: new Date() },
          });
      } else reply.clearCookie(names.session, cookieOptions(config));
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.headers.origin !== config.origin)
        throw new HttpError(403, 'This request came from an untrusted origin.');
      const csrf = request.auth?.csrf ?? request.cookies[names.csrf];
      if (!csrf || !equals(request.headers['x-csrf-token'], csrf))
        throw new HttpError(403, 'Security token expired. Refresh and try again.');
      if (!request.headers['content-type']?.startsWith('application/json'))
        throw new HttpError(415, 'Use an application/json request.');
    }
  });
  app.addHook('onResponse', async (request, reply) => {
    if (request.url.startsWith('/api/'))
      app.log.info(
        {
          route: request.routeOptions.url,
          method: request.method,
          status: reply.statusCode,
          elapsedMs: reply.elapsedTime,
        },
        'request',
      );
  });
}
export async function issueSession(
  db: PrismaClient,
  request: FastifyRequest,
  reply: FastifyReply,
  config: Config,
  accountId: string,
) {
  const raw = token();
  const csrf = token();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.$transaction(async (tx) => {
    if (request.auth) await tx.session.deleteMany({ where: { id: request.auth.id } });
    await tx.session.create({
      data: {
        id: hash(raw),
        csrf,
        accountId,
        expiresAt,
        device: (request.headers['user-agent'] ?? 'Unknown browser').slice(0, 200),
      },
    });
    await tx.securityEvent.create({ data: { accountId, action: 'Signed in with a passkey' } });
  });
  reply.setCookie(cookieNames(config).session, raw, {
    ...cookieOptions(config),
    expires: expiresAt,
  });
  return { csrf };
}
