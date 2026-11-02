import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type AuthenticatorTransport,
} from '@simplewebauthn/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { handleSchema } from '@vaultline/contracts';
import type { Config } from './config.js';
import {
  authenticated,
  cookieNames,
  cookieOptions,
  hash,
  HttpError,
  issueSession,
  recentlyVerified,
  token,
} from './security.js';

const verificationBody = z.strictObject({
  response: z.record(z.string(), z.unknown()),
  name: z.string().trim().min(1).max(60).default('My passkey'),
});
export function registerAuthRoutes(app: FastifyInstance, db: PrismaClient, config: Config) {
  const names = cookieNames(config);
  const createChallenge = async (
    _request: FastifyRequest,
    reply: FastifyReply,
    data: { value: string; kind: string; handle?: string; accountId?: string; sessionId?: string },
  ) => {
    const raw = token();
    await db.$transaction([
      db.challenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      db.challenge.create({
        data: { id: hash(raw), ...data, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      }),
    ]);
    reply.setCookie(names.flow, raw, { ...cookieOptions(config), maxAge: 300 });
  };
  const consumeChallenge = async (request: FastifyRequest, reply: FastifyReply, kind: string) => {
    const raw = request.cookies[names.flow];
    reply.clearCookie(names.flow, cookieOptions(config));
    if (!raw) throw new HttpError(400, 'Start a new passkey request.');
    // DELETE RETURNING consumes a ceremony exactly once, even for concurrent verification requests.
    const challenge = await db.challenge.delete({ where: { id: hash(raw) } }).catch(() => null);
    if (!challenge || challenge.kind !== kind || challenge.expiresAt.getTime() <= Date.now())
      throw new HttpError(400, 'Passkey request expired. Try again.');
    return challenge;
  };

  app.get('/api/context', async (request, reply) => {
    if (!request.auth) {
      const csrf = token();
      reply.setCookie(names.csrf, csrf, { ...cookieOptions(config), maxAge: 3600 });
      return { profile: null, csrf };
    }
    const account = await db.account.findUniqueOrThrow({
      where: { id: request.auth.accountId },
      include: { vault: true },
    });
    return {
      csrf: request.auth.csrf,
      profile: {
        id: account.id,
        handle: account.handle,
        csrf: request.auth.csrf,
        vault: account.vault?.envelope ?? null,
        keyVersion: account.vault?.keyVersion ?? 0,
        generation: account.vault?.generation ?? 0,
      },
    };
  });

  app.post(
    '/api/auth/register/options',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const { handle } = z.strictObject({ handle: handleSchema }).parse(request.body);
      if (await db.account.findUnique({ where: { handle } }))
        throw new HttpError(409, 'That handle is unavailable. Choose another.');
      const accountId = crypto.randomUUID();
      const options = await generateRegistrationOptions({
        rpName: 'Vaultline',
        rpID: config.rpId,
        userName: handle,
        userID: new TextEncoder().encode(accountId),
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });
      await createChallenge(request, reply, {
        value: options.challenge,
        kind: 'register',
        handle,
        accountId,
      });
      return options;
    },
  );
  app.post('/api/auth/register/verify', async (request, reply) => {
    const { response, name } = verificationBody.parse(request.body);
    const challenge = await consumeChallenge(request, reply, 'register');
    let result;
    try {
      result = await verifyRegistrationResponse({
        response: response as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge.value,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        requireUserVerification: true,
      });
    } catch {
      throw new HttpError(400, 'Passkey verification failed. Try again.');
    }
    if (!result.verified || !result.registrationInfo || !challenge.handle)
      throw new HttpError(400, 'Passkey verification failed.');
    const credential = result.registrationInfo.credential;
    if (!challenge.accountId) throw new HttpError(400, 'Account registration request is invalid.');
    const account = await db.account.create({
      data: {
        id: challenge.accountId,
        handle: challenge.handle,
        passkeys: {
          create: {
            id: credential.id,
            publicKey: Buffer.from(credential.publicKey),
            counter: BigInt(credential.counter),
            transports: credential.transports ?? [],
            name,
          },
        },
        events: { create: { action: 'Account created with a passkey' } },
      },
    });
    return issueSession(db, request, reply, config, account.id);
  });

  app.post(
    '/api/auth/login/options',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      z.strictObject({}).parse(request.body);
      const options = await generateAuthenticationOptions({
        rpID: config.rpId,
        userVerification: 'required',
      });
      await createChallenge(request, reply, {
        value: options.challenge,
        kind: 'login',
        accountId: request.auth?.accountId,
        sessionId: request.auth?.id,
      });
      return options;
    },
  );
  app.post('/api/auth/login/verify', async (request, reply) => {
    const { response } = verificationBody.parse(request.body);
    const challenge = await consumeChallenge(request, reply, 'login');
    const credentialId = z.string().min(1).max(2048).parse(response.id);
    const passkey = await db.passkey.findUnique({ where: { id: credentialId } });
    if (!passkey) throw new HttpError(400, 'Passkey verification failed.');
    if (
      challenge.accountId &&
      (challenge.accountId !== passkey.accountId || challenge.sessionId !== request.auth?.id)
    )
      throw new HttpError(403, 'Use a passkey belonging to your current account.');
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response: response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge.value,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        requireUserVerification: true,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports as AuthenticatorTransport[],
        },
      });
    } catch {
      throw new HttpError(400, 'Passkey verification failed.');
    }
    if (!result.verified) throw new HttpError(400, 'Passkey verification failed.');
    const updated = await db.passkey.updateMany({
      where: { id: passkey.id, counter: passkey.counter },
      data: { counter: BigInt(result.authenticationInfo.newCounter) },
    });
    if (!updated.count)
      throw new HttpError(409, 'This passkey was used concurrently. Please try signing in again.');
    return issueSession(db, request, reply, config, passkey.accountId);
  });

  app.post('/api/auth/passkeys/options', async (request, reply) => {
    const session = recentlyVerified(request);
    z.strictObject({}).parse(request.body);
    const account = await db.account.findUniqueOrThrow({
      where: { id: session.accountId },
      include: { passkeys: true },
    });
    if (account.passkeys.length >= 5)
      throw new HttpError(400, 'You can register up to five passkeys.');
    const options = await generateRegistrationOptions({
      rpName: 'Vaultline',
      rpID: config.rpId,
      userName: account.handle,
      userID: new TextEncoder().encode(account.id),
      attestationType: 'none',
      excludeCredentials: account.passkeys.map((key) => ({
        id: key.id,
        transports: key.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    await createChallenge(request, reply, {
      value: options.challenge,
      kind: 'enroll',
      accountId: account.id,
      sessionId: session.id,
    });
    return options;
  });
  app.post('/api/auth/passkeys/verify', async (request, reply) => {
    const session = recentlyVerified(request);
    const { response, name } = verificationBody.parse(request.body);
    const challenge = await consumeChallenge(request, reply, 'enroll');
    if (challenge.accountId !== session.accountId || challenge.sessionId !== session.id)
      throw new HttpError(403, 'Passkey request does not match this session.');
    let result;
    try {
      result = await verifyRegistrationResponse({
        response: response as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge.value,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        requireUserVerification: true,
      });
    } catch {
      throw new HttpError(400, 'Passkey verification failed.');
    }
    if (!result.verified || !result.registrationInfo)
      throw new HttpError(400, 'Passkey verification failed.');
    const credential = result.registrationInfo.credential;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${session.accountId}::uuid FOR UPDATE`;
      if ((await tx.passkey.count({ where: { accountId: session.accountId } })) >= 5)
        throw new HttpError(400, 'You can register up to five passkeys.');
      await tx.passkey.create({
        data: {
          id: credential.id,
          accountId: session.accountId,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
          name,
        },
      });
      await tx.securityEvent.create({
        data: { accountId: session.accountId, action: 'Additional passkey registered' },
      });
    });
    return { ok: true };
  });
  app.get('/api/passkeys', async (request) => {
    const session = authenticated(request);
    return db.passkey.findMany({
      where: { accountId: session.accountId },
      select: { id: true, name: true, createdAt: true },
    });
  });
  app.get('/api/sessions', async (request) => {
    const session = authenticated(request);
    const sessions = await db.session.findMany({
      where: {
        accountId: session.accountId,
        expiresAt: { gt: new Date() },
        lastSeenAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map(({ id, device, createdAt, lastSeenAt, expiresAt }) => ({
      id,
      device,
      createdAt,
      lastSeenAt,
      expiresAt,
      current: id === session.id,
    }));
  });
  app.delete('/api/sessions/:id', async (request) => {
    const session = authenticated(request);
    const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).parse(request.params);
    if (id === session.id) throw new HttpError(400, 'Use sign out to end your current session.');
    await db.$transaction(async (tx) => {
      const deleted = await tx.session.deleteMany({ where: { id, accountId: session.accountId } });
      if (!deleted.count) throw new HttpError(404, 'Session not found.');
      await tx.securityEvent.create({
        data: { accountId: session.accountId, action: 'Another session revoked' },
      });
    });
    return { ok: true };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const session = authenticated(request);
    await db.$transaction([
      db.session.deleteMany({ where: { id: session.id } }),
      db.securityEvent.create({ data: { accountId: session.accountId, action: 'Signed out' } }),
    ]);
    reply.clearCookie(names.session, cookieOptions(config));
    return { ok: true };
  });
  app.get('/api/events', async (request) => {
    const session = authenticated(request);
    return db.securityEvent.findMany({
      where: {
        accountId: session.accountId,
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, action: true, createdAt: true },
    });
  });
}
