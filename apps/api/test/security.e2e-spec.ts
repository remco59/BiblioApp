import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { totp } from '../src/auth/totp';
import { createApp, createUser, login, PASSWORD, resetCatalog, resetDb } from './helpers';

process.env.AUTH_RATE_LIMIT_MAX = '1000';

type Who = { cookie: string; csrf: string };

describe('Online betalen en 2FA (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let staff: Who;
  let lid: Who;
  let lidMemberId: number;

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    who?: Who,
    payload?: object,
  ) =>
    app.inject({
      method,
      url: `/api/${url}`,
      payload,
      headers: who ? { cookie: who.cookie, 'x-csrf-token': who.csrf } : {},
    });

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
  });
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.onlinePayment.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.fine.deleteMany();
    await prisma.loan.deleteMany();
    await prisma.setting.deleteMany();
    await resetCatalog(prisma);
    await resetDb(prisma);
    await createUser(prisma, 'bib@example.nl', 'LIBRARIAN');
    const l = await createUser(prisma, 'lid@example.nl', 'MEMBER');
    lidMemberId = (await prisma.member.findUniqueOrThrow({ where: { userId: l.id } })).id;
    staff = await login(app, 'bib@example.nl');
    lid = await login(app, 'lid@example.nl');
  });
  afterAll(() => app.close());

  describe('online boete betalen (mock-provider)', () => {
    const fineFor = (amountCents = 800) =>
      prisma.fine.create({ data: { memberId: lidMemberId, reason: 'OVERDUE', amountCents } });
    const refOf = (url: string) => /\/pay\/mock\/(mock_\w+)/.exec(url)![1]!;

    it('start een betaling en boekt na succes precies één betaling', async () => {
      const fine = await fineFor();
      const start = await call('POST', `me/fines/${fine.id}/pay-online`, lid);
      expect(start.statusCode).toBe(200);
      const ref = refOf(start.json().checkoutUrl);
      expect((await call('GET', `payments/${ref}`)).json()).toMatchObject({
        amountCents: 800,
        status: 'PENDING',
        description: `Boete #${fine.id}`,
      });

      // Nog niet betaald: webhook doet niets
      expect(
        (await call('POST', 'payments/webhook', undefined, { providerRef: ref })).statusCode,
      ).toBe(204);
      expect(await prisma.payment.count()).toBe(0);

      expect(
        (
          await call('POST', `payments/mock/${ref}/complete`, undefined, { outcome: 'PAID' })
        ).json(),
      ).toEqual({ status: 'PAID' });
      expect(await prisma.payment.findMany()).toEqual([
        expect.objectContaining({ fineId: fine.id, amountCents: 800, method: 'ONLINE' }),
      ]);
      // idempotent: webhook en nogmaals voltooien boeken niet dubbel
      await call('POST', 'payments/webhook', undefined, { providerRef: ref });
      await call('POST', `payments/mock/${ref}/complete`, undefined, { outcome: 'PAID' });
      expect(await prisma.payment.count()).toBe(1);
      expect(
        (await call('GET', 'staff/members/' + lidMemberId, staff)).json().fines[0],
      ).toMatchObject({ status: 'PAID', outstandingCents: 0 });
      // en de boete kan niet nog eens betaald worden
      expect((await call('POST', `me/fines/${fine.id}/pay-online`, lid)).json().code).toBe(
        'FINE_NOT_OPEN',
      );
    });

    it('een mislukte betaling boekt niets en je kunt opnieuw proberen', async () => {
      const fine = await fineFor(500);
      const ref = refOf(
        (await call('POST', `me/fines/${fine.id}/pay-online`, lid)).json().checkoutUrl,
      );
      expect(
        (
          await call('POST', `payments/mock/${ref}/complete`, undefined, { outcome: 'FAILED' })
        ).json(),
      ).toEqual({ status: 'FAILED' });
      expect(await prisma.payment.count()).toBe(0);
      const again = await call('POST', `me/fines/${fine.id}/pay-online`, lid);
      expect(again.statusCode).toBe(200);
      expect(refOf(again.json().checkoutUrl)).not.toBe(ref);
    });

    it('rekent alleen het openstaande bedrag af en ziet andermans boete niet', async () => {
      const fine = await fineFor(1000);
      await prisma.payment.create({ data: { fineId: fine.id, amountCents: 300 } });
      const ref = refOf(
        (await call('POST', `me/fines/${fine.id}/pay-online`, lid)).json().checkoutUrl,
      );
      expect((await call('GET', `payments/${ref}`)).json().amountCents).toBe(700);

      const other = await createUser(prisma, 'ander@example.nl', 'MEMBER');
      void other;
      const otherSession = await login(app, 'ander@example.nl');
      expect((await call('POST', `me/fines/${fine.id}/pay-online`, otherSession)).statusCode).toBe(
        404,
      );
      expect((await call('POST', `me/fines/${fine.id}/pay-online`)).statusCode).toBe(401);
      expect((await call('GET', 'payments/onbekend')).statusCode).toBe(404);
    });

    it('boekt niet meer dan er nog open stond (bijv. tussentijds contant betaald of kwijtgescholden)', async () => {
      const fine = await fineFor(800);
      const ref = refOf(
        (await call('POST', `me/fines/${fine.id}/pay-online`, lid)).json().checkoutUrl,
      );
      await call('POST', `staff/fines/${fine.id}/pay`, staff, { amountCents: 500 }); // balie ontvangt contant
      await call('POST', `payments/mock/${ref}/complete`, undefined, { outcome: 'PAID' });
      const total = (await prisma.payment.findMany()).reduce((s, p) => s + p.amountCents, 0);
      expect(total).toBe(800); // 500 contant + 300 online, niet 1300
    });

    it('is uit te schakelen (geen provider geconfigureerd)', async () => {
      const fine = await fineFor();
      const payments = app.get(PaymentsService) as unknown as { provider: unknown };
      const saved = payments.provider;
      payments.provider = null;
      try {
        const res = await call('POST', `me/fines/${fine.id}/pay-online`, lid);
        expect(res.statusCode).toBe(501);
        expect(res.json().code).toBe('PAYMENTS_DISABLED');
        expect(
          (await call('POST', 'payments/mock/x/complete', undefined, { outcome: 'PAID' }))
            .statusCode,
        ).toBe(404);
      } finally {
        payments.provider = saved;
      }
    });
  });

  describe('tweestapsverificatie (TOTP)', () => {
    async function enable(who = lid) {
      const setup = (await call('POST', 'auth/2fa/setup', who)).json();
      const enabled = await call('POST', 'auth/2fa/enable', who, { code: totp(setup.secret) });
      return {
        secret: setup.secret as string,
        codes: enabled.json().codes as string[],
        res: enabled,
      };
    }

    it('zet 2FA aan na bevestiging met een geldige code en geeft herstelcodes', async () => {
      const setup = (await call('POST', 'auth/2fa/setup', lid)).json();
      expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(setup.otpauthUrl).toContain(`secret=${setup.secret}`);
      expect((await call('POST', 'auth/2fa/enable', lid, { code: '000000' })).json().code).toBe(
        'TOTP_INVALID',
      );
      expect((await call('GET', 'auth/me', lid)).json().totpEnabled).toBe(false);

      const res = await call('POST', 'auth/2fa/enable', lid, { code: totp(setup.secret) });
      expect(res.statusCode).toBe(200);
      expect(res.json().codes).toHaveLength(10);
      expect((await call('GET', 'auth/me', lid)).json().totpEnabled).toBe(true);
      // geheimen en herstelcodes staan nooit leesbaar in de database (codes gehasht)
      const stored = await prisma.recoveryCode.findMany();
      expect(stored.some((r) => res.json().codes.includes(r.codeHash))).toBe(false);
      expect((await call('POST', 'auth/2fa/setup', lid)).json().code).toBe('TOTP_ALREADY_ENABLED');
      expect((await call('POST', 'auth/2fa/setup')).statusCode).toBe(401);
    });

    it('inloggen vraagt dan een code; een code werkt maar één keer', async () => {
      const { secret } = await enable();
      const noCode = await login(app, 'lid@example.nl');
      expect(noCode.res.statusCode).toBe(401);
      expect(noCode.res.json().code).toBe('TOTP_REQUIRED');

      const attempt = (totpCode: string) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'lid@example.nl', password: PASSWORD, totp: totpCode },
        });
      expect((await attempt('123456')).json().code).toBe('TOTP_INVALID');
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'lid@example.nl', password: 'fout-wachtwoord', totp: totp(secret) },
          })
        ).statusCode,
      ).toBe(401);

      // de code die bij het inschakelen is gebruikt, is "verbrand" (zelfde stap)
      expect((await attempt(totp(secret))).json().code).toBe('TOTP_INVALID');
      const next = totp(secret, Date.now() + 30_000);
      const ok = await attempt(next);
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ email: 'lid@example.nl', totpEnabled: true });
      // dezelfde code opnieuw (replay) wordt geweigerd
      expect((await attempt(next)).json().code).toBe('TOTP_INVALID');
    });

    it('herstelcodes werken eenmalig', async () => {
      const { codes } = await enable();
      const attempt = (c: string) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'lid@example.nl', password: PASSWORD, totp: c },
        });
      expect((await attempt(codes[0]!)).statusCode).toBe(200);
      expect((await attempt(codes[0]!)).statusCode).toBe(401);
      expect((await attempt(codes[1]!.toUpperCase())).statusCode).toBe(200); // hoofdletters maken niet uit
      expect(
        (await prisma.auditLog.findMany({ where: { action: 'auth.recovery_code_used' } })).length,
      ).toBe(2);
    });

    it('uitschakelen vraagt wachtwoord én code', async () => {
      const { codes } = await enable();
      expect(
        (await call('POST', 'auth/2fa/disable', lid, { password: 'fout', code: codes[0] })).json()
          .code,
      ).toBe('PASSWORD_INVALID');
      expect(
        (await call('POST', 'auth/2fa/disable', lid, { password: PASSWORD, code: '000000' })).json()
          .code,
      ).toBe('TOTP_INVALID');
      expect(
        (await call('POST', 'auth/2fa/disable', lid, { password: PASSWORD, code: codes[0] }))
          .statusCode,
      ).toBe(204);
      expect((await call('GET', 'auth/me', lid)).json().totpEnabled).toBe(false);
      expect(await prisma.recoveryCode.count()).toBe(0);
      expect((await login(app, 'lid@example.nl')).res.statusCode).toBe(200); // weer zonder code
      expect(
        (await call('POST', 'auth/2fa/disable', lid, { password: PASSWORD, code: '123456' })).json()
          .code,
      ).toBe('TOTP_NOT_ENABLED');
    });
  });
});
