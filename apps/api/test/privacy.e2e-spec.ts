import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { totp } from '../src/auth/totp';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrivacyService } from '../src/privacy/privacy.service';
import { MaintenanceService } from '../src/reservations/maintenance.service';
import { createApp, createUser, login, PASSWORD, resetCatalog, resetDb } from './helpers';

process.env.AUTH_RATE_LIMIT_MAX = '1000';

type Who = { cookie: string; csrf: string };
const DAY = 86400000;

describe('Privacy / AVG (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let staff: Who;
  let admin: Who;
  let lid: Who;
  let lidId: number;
  let lidMemberId: number;
  let bookId: number;

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, who?: Who, payload?: object) =>
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
    await resetCatalog(prisma);
    await resetDb(prisma);
    await createUser(prisma, 'bib@example.nl', 'LIBRARIAN');
    await createUser(prisma, 'admin@example.nl', 'ADMIN');
    const l = await createUser(prisma, 'lid@example.nl', 'MEMBER');
    lidId = l.id;
    lidMemberId = (await prisma.member.findUniqueOrThrow({ where: { userId: l.id } })).id;
    staff = await login(app, 'bib@example.nl');
    admin = await login(app, 'admin@example.nl');
    lid = await login(app, 'lid@example.nl');
    bookId = (await prisma.book.create({ data: { title: 'Het diner' } })).id;
  });
  afterAll(() => app.close());

  const addLoan = async (barcode: string, returnedDaysAgo?: number, memberId = lidMemberId) => {
    const copy = await prisma.copy.create({
      data: { bookId, barcode, status: returnedDaysAgo === undefined ? 'LOANED' : 'AVAILABLE' },
    });
    return prisma.loan.create({
      data: {
        copyId: copy.id,
        memberId,
        loanedAt: new Date(Date.now() - ((returnedDaysAgo ?? 0) + 10) * DAY),
        dueAt: new Date(Date.now() + 7 * DAY),
        returnedAt:
          returnedDaysAgo === undefined ? null : new Date(Date.now() - returnedDaysAgo * DAY),
        outcome: returnedDaysAgo === undefined ? null : 'RETURNED',
      },
    });
  };

  it('toont het privacybeleid openbaar met de actuele bewaartermijnen', async () => {
    expect((await call('GET', 'privacy/policy')).json()).toEqual({
      retentionLoanMonths: 24,
      retentionAuditMonths: 12,
      retentionNotificationDays: 90,
      retentionInactiveMemberMonths: 36,
    });
    await call('PATCH', 'admin/settings', admin, { retentionLoanMonths: 6 });
    expect((await call('GET', 'privacy/policy')).json().retentionLoanMonths).toBe(6);
  });

  it('exporteert alle eigen gegevens, en geen wachtwoord of geheimen', async () => {
    await addLoan('C1', 3);
    await prisma.wishlistItem.create({ data: { userId: lidId, bookId } });
    await prisma.suggestion.create({ data: { userId: lidId, title: 'Dune', author: 'Herbert' } });
    await prisma.review.create({ data: { userId: lidId, bookId, rating: 4, body: 'Mooi' } });
    await prisma.fine.create({
      data: {
        memberId: lidMemberId,
        reason: 'OVERDUE',
        amountCents: 100,
        payments: { create: { amountCents: 100 } },
      },
    });
    await prisma.notification.create({
      data: { userId: lidId, type: 'LOAN_DUE_SOON', title: 'T', body: 'B' },
    });
    await prisma.user.update({ where: { id: lidId }, data: { totpSecret: 'GEHEIMGEHEIMGEHEIM' } });

    const res = await call('GET', 'users/me/export', lid);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ email: 'lid@example.nl' });
    expect(body.loans).toEqual([
      expect.objectContaining({ title: 'Het diner', outcome: 'RETURNED' }),
    ]);
    expect(body.fines[0].payments).toHaveLength(1);
    expect(body.wishlist).toEqual([expect.objectContaining({ title: 'Het diner' })]);
    expect(body.suggestions[0]).toMatchObject({ title: 'Dune' });
    expect(body.reviews[0]).toMatchObject({ rating: 4 });
    expect(body.notifications).toHaveLength(1);
    expect(body.activity.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|GEHEIMGEHEIM|argon2/);
  });

  describe('account verwijderen (anonimiseren)', () => {
    it('vraagt het juiste wachtwoord', async () => {
      expect((await call('POST', 'me/account/delete', lid, { password: 'fout' })).json().code).toBe(
        'PASSWORD_INVALID',
      );
      expect(
        (await call('POST', 'me/account/delete', undefined, { password: PASSWORD })).statusCode,
      ).toBe(401);
    });

    it('weigert bij lopende uitleningen of openstaande boetes', async () => {
      await addLoan('C1');
      expect(
        (await call('POST', 'me/account/delete', lid, { password: PASSWORD })).json().code,
      ).toBe('ACTIVE_LOANS');
      await prisma.loan.updateMany({ data: { returnedAt: new Date(), outcome: 'RETURNED' } });
      await prisma.fine.create({
        data: { memberId: lidMemberId, reason: 'LOST', amountCents: 2500 },
      });
      expect(
        (await call('POST', 'me/account/delete', lid, { password: PASSWORD })).json().code,
      ).toBe('OUTSTANDING_FINES');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: lidId } })).email).toBe(
        'lid@example.nl',
      );
    });

    it('anonimiseert het account, wist persoonsgegevens en behoudt de historie consistent', async () => {
      await addLoan('C1', 5);
      await prisma.wishlistItem.create({ data: { userId: lidId, bookId } });
      await prisma.suggestion.create({ data: { userId: lidId, title: 'Dune', author: 'Herbert' } });
      await prisma.review.create({ data: { userId: lidId, bookId, rating: 4 } });
      await prisma.notification.create({
        data: { userId: lidId, type: 'LOAN_DUE_SOON', title: 'T', body: 'B' },
      });

      const res = await call('POST', 'me/account/delete', lid, { password: PASSWORD });
      expect(res.statusCode).toBe(204);
      expect(res.cookies.find((c) => c.name === 'sid')?.value).toBe('');

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: lidId },
        include: { member: true },
      });
      expect(user).toMatchObject({
        email: `verwijderd-${lidId}@anonymized.invalid`,
        name: 'Verwijderd lid',
        emailVerifiedAt: null,
      });
      expect(user.disabledAt).not.toBeNull();
      expect(user.member).toMatchObject({ memberNumber: `ANON-${user.member!.id}`, blocked: true });
      expect(await prisma.wishlistItem.count()).toBe(0);
      expect(await prisma.suggestion.count()).toBe(0);
      expect(await prisma.review.count()).toBe(0);
      expect(await prisma.notification.count({ where: { userId: lidId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: lidId } })).toBe(0);
      expect(await prisma.loan.count()).toBe(1); // historie blijft tot de bewaartermijn verloopt, maar is niet meer herleidbaar
      expect(
        (await prisma.auditLog.findMany({ where: { action: 'privacy.anonymize' } })).length,
      ).toBe(1);

      expect((await call('GET', 'auth/me', lid)).statusCode).toBe(401);
      expect((await login(app, 'lid@example.nl')).res.statusCode).toBe(401); // oud adres bestaat niet meer
      expect((await login(app, `verwijderd-${lidId}@anonymized.invalid`)).res.statusCode).toBe(401);
      // opnieuw anonimiseren is onschadelijk
      await app.get(PrivacyService).anonymize(lidId, null);
    });

    it('annuleert reserveringen en geeft het klaargelegde exemplaar door', async () => {
      const other = await createUser(prisma, 'ander@example.nl', 'MEMBER');
      const otherSession = await login(app, 'ander@example.nl');
      const copy = await prisma.copy.create({ data: { bookId, barcode: 'R1', status: 'LOANED' } });
      await prisma.loan.create({
        data: {
          copyId: copy.id,
          memberId: (await prisma.member.findUniqueOrThrow({ where: { userId: other.id } })).id,
          dueAt: new Date(Date.now() + DAY),
        },
      });
      await call('POST', 'me/reservations', lid, { bookId });
      const third = await createUser(prisma, 'derde@example.nl', 'MEMBER');
      const thirdSession = await login(app, 'derde@example.nl');
      await call('POST', 'me/reservations', thirdSession, { bookId });
      void otherSession;
      await call('POST', 'staff/loans/checkin', staff, { barcode: 'R1' }); // lid krijgt hem

      expect(
        (await call('POST', 'me/account/delete', lid, { password: PASSWORD })).statusCode,
      ).toBe(204);
      const hold = await prisma.reservation.findFirstOrThrow({ where: { status: 'READY' } });
      expect((await prisma.member.findUniqueOrThrow({ where: { id: hold.memberId } })).userId).toBe(
        third.id,
      );
      expect((await prisma.copy.findUniqueOrThrow({ where: { barcode: 'R1' } })).status).toBe(
        'RESERVED_HOLD',
      );
    });

    it('vraagt bij ingeschakelde 2FA ook een code', async () => {
      const setup = (await call('POST', 'auth/2fa/setup', lid)).json();
      await call('POST', 'auth/2fa/enable', lid, { code: totp(setup.secret) });
      expect(
        (await call('POST', 'me/account/delete', lid, { password: PASSWORD })).json().code,
      ).toBe('TOTP_INVALID');
      expect(
        (
          await call('POST', 'me/account/delete', lid, {
            password: PASSWORD,
            code: totp(setup.secret, Date.now() + 30_000),
          })
        ).statusCode,
      ).toBe(204);
    });

    it('beheerdersaccounts kunnen niet worden verwijderd; beheerders kunnen wel een lid anonimiseren', async () => {
      expect(
        (await call('POST', 'me/account/delete', admin, { password: PASSWORD })).json().code,
      ).toBe('ADMIN_ACCOUNT');
      expect((await call('POST', `admin/users/${lidId}/anonymize`, staff)).statusCode).toBe(403);
      expect((await call('POST', `admin/users/${lidId}/anonymize`, admin)).statusCode).toBe(204);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: lidId } })).name).toBe(
        'Verwijderd lid',
      );
      expect((await call('POST', 'admin/users/99999/anonymize', admin)).statusCode).toBe(404);
    });
  });

  describe('bewaartermijnen', () => {
    const MONTH = 31 * DAY;

    it('verwijdert verlopen gegevens en laat recente en openstaande gegevens staan', async () => {
      const oldLoan = await addLoan('OLD', 24 * 31 + 5);
      await addLoan('RECENT', 30);
      await addLoan('ACTIVE'); // lopend: nooit verwijderen
      const paid = await prisma.fine.create({
        data: {
          memberId: lidMemberId,
          loanId: oldLoan.id,
          reason: 'OVERDUE',
          amountCents: 100,
          createdAt: new Date(Date.now() - 25 * MONTH),
          payments: { create: { amountCents: 100 } },
        },
      });
      const open = await prisma.fine.create({
        data: {
          memberId: lidMemberId,
          loanId: oldLoan.id,
          reason: 'LOST',
          amountCents: 2500,
          createdAt: new Date(Date.now() - 25 * MONTH),
        },
      });
      await prisma.notification.createMany({
        data: [
          {
            userId: lidId,
            type: 'X',
            title: 'oud gelezen',
            body: '',
            readAt: new Date(Date.now() - 100 * DAY),
          },
          {
            userId: lidId,
            type: 'X',
            title: 'recent gelezen',
            body: '',
            readAt: new Date(Date.now() - 10 * DAY),
          },
          { userId: lidId, type: 'X', title: 'ongelezen', body: '' },
        ],
      });
      await prisma.auditLog.createMany({
        data: [
          { action: 'oud', createdAt: new Date(Date.now() - 13 * MONTH) },
          { action: 'recent' },
        ],
      });
      await prisma.session.create({
        data: {
          id: 'verlopen',
          userId: lidId,
          csrfToken: 'x',
          expiresAt: new Date(Date.now() - DAY),
        },
      });
      const oldRes = await prisma.reservation.create({
        data: {
          bookId,
          memberId: lidMemberId,
          status: 'CANCELLED',
          closedAt: new Date(Date.now() - 5 * MONTH),
        },
      });

      const result = await app.get(PrivacyService).runRetention();
      expect(result.deleted).toBe(6); // boete, uitleen, melding, auditregel, sessie, reservering

      expect(await prisma.loan.findUnique({ where: { id: oldLoan.id } })).toBeNull();
      expect(await prisma.loan.count()).toBe(2); // recent + actief
      expect(await prisma.fine.findUnique({ where: { id: paid.id } })).toBeNull();
      expect(await prisma.fine.findUniqueOrThrow({ where: { id: open.id } })).toMatchObject({
        loanId: null,
        amountCents: 2500,
      });
      expect(
        (await prisma.notification.findMany({ where: { userId: lidId } }))
          .map((n) => n.title)
          .sort(),
      ).toEqual(['ongelezen', 'recent gelezen']);
      expect(
        (await prisma.auditLog.findMany({ where: { action: { in: ['oud', 'recent'] } } })).map(
          (a) => a.action,
        ),
      ).toEqual(['recent']);
      expect(await prisma.session.findUnique({ where: { id: 'verlopen' } })).toBeNull();
      expect(await prisma.reservation.findUnique({ where: { id: oldRes.id } })).toBeNull();

      // idempotent
      expect((await app.get(PrivacyService).runRetention()).deleted).toBe(0);
    });

    it('respecteert aangepaste bewaartermijnen', async () => {
      await addLoan('C1', 100); // ~3 maanden geleden ingeleverd
      await call('PATCH', 'admin/settings', admin, { retentionLoanMonths: 2 });
      await app.get(PrivacyService).runRetention();
      expect(await prisma.loan.count()).toBe(0);
    });

    it('anonimiseert inactieve leden, maar niet de actieve of leden met een openstaande boete', async () => {
      const mk = async (email: string) => {
        const u = await createUser(prisma, email, 'MEMBER');
        const m = await prisma.member.findUniqueOrThrow({ where: { userId: u.id } });
        await prisma.member.update({
          where: { id: m.id },
          data: { membershipUntil: new Date(Date.now() - 40 * MONTH) },
        });
        return { u, m };
      };
      const inactive = await mk('inactief@example.nl');
      const fined = await mk('boete@example.nl');
      await prisma.fine.create({
        data: { memberId: fined.m.id, reason: 'LOST', amountCents: 500 },
      });
      const recentLoan = await mk('recent@example.nl');
      await addLoan('RL', 20, recentLoan.m.id);
      // lid met geldig lidmaatschap blijft ongemoeid
      const result = await app.get(PrivacyService).runRetention();
      expect(result.anonymized).toBe(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: inactive.u.id } })).email).toMatch(
        /@anonymized\.invalid$/,
      );
      expect((await prisma.user.findUniqueOrThrow({ where: { id: fined.u.id } })).email).toBe(
        'boete@example.nl',
      );
      expect((await prisma.user.findUniqueOrThrow({ where: { id: recentLoan.u.id } })).email).toBe(
        'recent@example.nl',
      );
      expect((await prisma.user.findUniqueOrThrow({ where: { id: lidId } })).email).toBe(
        'lid@example.nl',
      );
      expect(
        (
          await prisma.user.findUniqueOrThrow({
            where: {
              id: (await prisma.user.findUniqueOrThrow({ where: { email: 'bib@example.nl' } })).id,
            },
          })
        ).role,
      ).toBe('LIBRARIAN');
    });

    it('draait mee in de nachtelijke job en rapporteert de aantallen', async () => {
      await addLoan('OLD', 24 * 31 + 5);
      const res = await app.get(MaintenanceService).runNightly();
      expect(res.retentionDeleted).toBeGreaterThanOrEqual(1);
      expect(res).toHaveProperty('membersAnonymized', 0);
    });
  });
});
