import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, createUser, login, MailStub, PASSWORD, resetDb } from './helpers';

process.env.AUTH_RATE_LIMIT_MAX = '1000';

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;
  let mail: MailStub;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, mail, prisma } = await createApp());
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  const post = (url: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: `/api/${url}`, payload, headers });

  it('registreert, verifieert, logt in en uit', async () => {
    const email = 'lid@example.nl';
    expect(
      (await post('auth/register', { email, name: 'Lid', password: PASSWORD })).statusCode,
    ).toBe(204);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { member: true },
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.role).toBe('MEMBER');
    expect(user.member?.memberNumber).toBeTruthy();

    // Inloggen kan pas na verificatie
    expect((await login(app, email)).res.statusCode).toBe(403);

    const token = mail.tokenFor(email);
    expect(token).not.toBe('');
    expect((await post('auth/verify-email', { token })).statusCode).toBe(204);
    // token is eenmalig
    expect((await post('auth/verify-email', { token })).statusCode).toBe(400);

    const { res, cookie, csrf } = await login(app, email);
    expect(res.statusCode).toBe(200);
    const sid = res.cookies.find((c) => c.name === 'sid')!;
    expect(sid.httpOnly).toBe(true);
    expect(sid.sameSite).toBe('Lax');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json()).toMatchObject({ email, role: 'MEMBER' });

    // Uitloggen vereist CSRF-token
    expect((await post('auth/logout', undefined, { cookie })).statusCode).toBe(403);
    expect(
      (await post('auth/logout', undefined, { cookie, 'x-csrf-token': csrf })).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode,
    ).toBe(401);

    const actions = (await prisma.auditLog.findMany()).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['auth.register', 'auth.verify_email', 'auth.login', 'auth.logout']),
    );
  });

  it('weigert dubbele registratie, zwak wachtwoord en verkeerd wachtwoord', async () => {
    await createUser(prisma, 'a@example.nl', 'MEMBER');
    expect(
      (await post('auth/register', { email: 'a@example.nl', name: 'A', password: PASSWORD }))
        .statusCode,
    ).toBe(409);
    expect(
      (await post('auth/register', { email: 'b@example.nl', name: 'B', password: 'kort' }))
        .statusCode,
    ).toBe(400);
    expect((await login(app, 'a@example.nl', 'verkeerd-wachtwoord')).res.statusCode).toBe(401);
    expect((await login(app, 'bestaat-niet@example.nl')).res.statusCode).toBe(401);
  });

  it('reset wachtwoord: werkt één keer en beëindigt sessies', async () => {
    const email = 'reset@example.nl';
    await createUser(prisma, email, 'MEMBER');
    const old = await login(app, email);

    expect((await post('auth/forgot-password', { email })).statusCode).toBe(204);
    // onbekend adres geeft hetzelfde antwoord
    expect((await post('auth/forgot-password', { email: 'nope@example.nl' })).statusCode).toBe(204);
    expect(mail.last('nope@example.nl')).toBeUndefined();

    const token = mail.tokenFor(email);
    expect(
      (await post('auth/reset-password', { token, password: 'Nieuw-wachtwoord-1' })).statusCode,
    ).toBe(204);
    expect(
      (await post('auth/reset-password', { token, password: 'Nog-een-ander-1' })).statusCode,
    ).toBe(400);

    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: old.cookie } }))
        .statusCode,
    ).toBe(401);
    expect((await login(app, email)).res.statusCode).toBe(401);
    expect((await login(app, email, 'Nieuw-wachtwoord-1')).res.statusCode).toBe(200);
  });

  it('verlopen sessie en verlopen token worden geweigerd', async () => {
    const email = 'exp@example.nl';
    const u = await createUser(prisma, email, 'MEMBER');
    const { cookie } = await login(app, email);
    await prisma.session.updateMany({
      where: { userId: u.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode,
    ).toBe(401);

    await post('auth/forgot-password', { email });
    const token = mail.tokenFor(email);
    await prisma.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(
      (await post('auth/reset-password', { token, password: 'Nieuw-wachtwoord-1' })).statusCode,
    ).toBe(400);
  });

  describe('autorisatie per rol (server-side)', () => {
    it.each([
      ['MEMBER', 'staff/ping', 403],
      ['MEMBER', 'admin/ping', 403],
      ['LIBRARIAN', 'staff/ping', 200],
      ['LIBRARIAN', 'admin/ping', 403],
      ['ADMIN', 'staff/ping', 200],
      ['ADMIN', 'admin/ping', 200],
    ] as const)('%s op %s geeft %i', async (role, path, status) => {
      const email = `${role.toLowerCase()}@example.nl`;
      await createUser(prisma, email, role);
      const { cookie } = await login(app, email);
      const res = await app.inject({ method: 'GET', url: `/api/${path}`, headers: { cookie } });
      expect(res.statusCode).toBe(status);
    });

    it('anoniem krijgt 401, catalogus blijft publiek', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/staff/ping' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/books' })).statusCode).toBe(200);
    });
  });

  it('profiel bijwerken en gegevensexport (AVG)', async () => {
    const email = 'profiel@example.nl';
    await createUser(prisma, email, 'MEMBER');
    const { cookie, csrf } = await login(app, email);
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      payload: { name: 'Nieuwe Naam' },
      headers: { cookie, 'x-csrf-token': csrf },
    });
    expect(patch.json()).toMatchObject({ name: 'Nieuwe Naam' });
    const exp = await app.inject({
      method: 'GET',
      url: '/api/users/me/export',
      headers: { cookie },
    });
    expect(exp.statusCode).toBe(200);
    expect(exp.json().user).toMatchObject({ email, name: 'Nieuwe Naam' });
    expect(JSON.stringify(exp.json())).not.toContain('passwordHash');
  });
});

describe('Rate limiting', () => {
  it('blokkeert te veel inlogpogingen', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '3';
    const { app, prisma } = await createApp();
    await resetDb(prisma);
    const codes: number[] = [];
    for (let i = 0; i < 5; i++)
      codes.push((await login(app, 'x@example.nl', 'fout-wachtwoord-1')).res.statusCode);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    await app.close();
  });
});
