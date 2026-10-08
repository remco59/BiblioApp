import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/prisma/prisma.service';
import { MaintenanceService } from '../src/reservations/maintenance.service';
import { createApp, createUser, login, MailStub, resetCatalog, resetDb } from './helpers';

process.env.AUTH_RATE_LIMIT_MAX = '1000';

type Who = { cookie: string; csrf: string };
const DAY = 86400000;

describe('Rapportage en beheer (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let mail: MailStub;
  let staff: Who;
  let admin: Who;
  let lid: Who;
  let adminId: number;
  let lidId: number;
  let lidMemberId: number;

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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
    ({ app, prisma, mail } = await createApp());
  });
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.onlinePayment.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.fine.deleteMany();
    await prisma.loan.deleteMany();
    await prisma.emailTemplate.deleteMany();
    await prisma.setting.deleteMany();
    await resetCatalog(prisma);
    await resetDb(prisma);
    mail.sent.length = 0;
    await createUser(prisma, 'bib@example.nl', 'LIBRARIAN');
    adminId = (await createUser(prisma, 'admin@example.nl', 'ADMIN')).id;
    const l = await createUser(prisma, 'lid@example.nl', 'MEMBER');
    lidId = l.id;
    lidMemberId = (await prisma.member.findUniqueOrThrow({ where: { userId: l.id } })).id;
    staff = await login(app, 'bib@example.nl');
    admin = await login(app, 'admin@example.nl');
    lid = await login(app, 'lid@example.nl');
  });
  afterAll(() => app.close());

  async function seedLoans() {
    const mk = async (title: string, copies: number) => {
      const b = await prisma.book.create({
        data: { title, authors: { create: { author: { create: { name: `Auteur ${title}` } } } } },
      });
      const cs = [];
      for (let i = 0; i < copies; i++)
        cs.push(await prisma.copy.create({ data: { bookId: b.id, barcode: `${title}-${i}` } }));
      return cs;
    };
    const [a1, a2] = await mk('Populair', 2);
    const [b1] = await mk('Minder populair', 1);
    const loan = (copyId: number, daysAgo: number, returnedDaysAgo?: number) =>
      prisma.loan.create({
        data: {
          copyId,
          memberId: lidMemberId,
          loanedAt: new Date(Date.now() - daysAgo * DAY),
          dueAt: new Date(Date.now() + (21 - daysAgo) * DAY),
          returnedAt:
            returnedDaysAgo === undefined ? null : new Date(Date.now() - returnedDaysAgo * DAY),
          outcome: returnedDaysAgo === undefined ? null : 'RETURNED',
        },
      });
    await loan(a1!.id, 5, 3);
    await loan(a1!.id, 2, 1);
    await loan(a2!.id, 40, 35); // buiten standaardperiode
    await loan(b1!.id, 1);
  }

  describe('rapportages', () => {
    it('zijn alleen voor medewerkers', async () => {
      expect((await call('GET', 'staff/reports/popular', lid)).statusCode).toBe(403);
      expect((await call('GET', 'staff/reports/popular')).statusCode).toBe(401);
      expect((await call('GET', 'staff/reports/popular', staff)).statusCode).toBe(200);
    });

    it('populairste boeken binnen de periode', async () => {
      await seedLoans();
      const rows = (await call('GET', 'staff/reports/popular', staff)).json();
      expect(rows).toEqual([
        expect.objectContaining({ title: 'Populair', authors: 'Auteur Populair', loans: 2 }),
        expect.objectContaining({ title: 'Minder populair', loans: 1 }),
      ]);
      const all = (
        await call(
          'GET',
          `staff/reports/popular?from=${new Date(Date.now() - 60 * DAY).toISOString().slice(0, 10)}`,
          staff,
        )
      ).json();
      expect(all[0]).toMatchObject({ title: 'Populair', loans: 3 });
      expect((await call('GET', 'staff/reports/popular?limit=1', staff)).json()).toHaveLength(1);
    });

    it('uitleenvolume per dag en per maand met lege perioden opgevuld', async () => {
      await seedLoans();
      const days = (await call('GET', 'staff/reports/volume', staff)).json();
      expect(days).toHaveLength(30);
      expect(days.reduce((s: number, d: { loans: number }) => s + d.loans, 0)).toBe(3);
      expect(days.reduce((s: number, d: { returns: number }) => s + d.returns, 0)).toBe(2);
      expect(days.filter((d: { loans: number }) => d.loans === 0).length).toBeGreaterThan(20);
      const months = (
        await call(
          'GET',
          'staff/reports/volume?interval=month&from=2020-01-01&to=2020-03-31',
          staff,
        )
      ).json();
      expect(months.map((m: { period: string }) => m.period)).toEqual([
        '2020-01',
        '2020-02',
        '2020-03',
      ]);
      expect((await call('GET', 'staff/reports/volume?from=kapot', staff)).statusCode).toBe(400);
    });

    it('achterstanden en boete-inkomsten', async () => {
      await seedLoans();
      await prisma.loan.updateMany({
        where: { returnedAt: null, copy: { barcode: { startsWith: 'Minder' } } },
        data: { dueAt: new Date(Date.now() - 3.5 * DAY) },
      });
      await app.get(MaintenanceService).runNightly(); // maakt de te-laat-boete (4 × 25 = 100)
      const overdue = (await call('GET', 'staff/reports/overdue', staff)).json();
      expect(overdue).toHaveLength(1);
      expect(overdue[0]).toMatchObject({
        title: 'Minder populair',
        memberNumber: expect.any(String),
        daysLate: 4,
        fineCents: 100,
      });

      const fine = await prisma.fine.findFirstOrThrow();
      await prisma.payment.create({ data: { fineId: fine.id, amountCents: 40 } });
      await prisma.fine.create({
        data: { memberId: lidMemberId, reason: 'LOST', amountCents: 2500, waivedAt: new Date() },
      });
      const rep = (await call('GET', 'staff/reports/fines', staff)).json();
      expect(rep).toMatchObject({
        issuedCents: 2600,
        collectedCents: 40,
        waivedCents: 2500,
        outstandingCents: 60,
      });
      expect(
        rep.byPeriod.reduce((s: number, p: { collectedCents: number }) => s + p.collectedCents, 0),
      ).toBe(40);
    });

    it('exporteert als CSV', async () => {
      await seedLoans();
      const csv = await call('GET', 'staff/reports/popular?format=csv', staff);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('populairste-boeken.csv');
      expect(csv.body.split('\n')[0]).toBe('boek_id,titel,auteurs,uitleningen');
      expect(csv.body).toContain('Populair,Auteur Populair,2');
      expect(
        (await call('GET', 'staff/reports/volume?format=csv', staff)).body.split('\n')[0],
      ).toBe('periode,uitleningen,inleveringen');
      expect(
        (await call('GET', 'staff/reports/overdue?format=csv', staff)).body.split('\n')[0],
      ).toContain('uitleen_id,titel');
      expect((await call('GET', 'staff/reports/fines?format=csv', staff)).body).toContain(
        'openstaand,0.00',
      );
    });
  });

  describe('gebruikers en rollen', () => {
    it('alleen beheerders zien en wijzigen gebruikers', async () => {
      expect((await call('GET', 'admin/users', staff)).statusCode).toBe(403);
      const list = (await call('GET', 'admin/users?q=lid', admin)).json();
      expect(list).toEqual([
        expect.objectContaining({
          email: 'lid@example.nl',
          role: 'MEMBER',
          disabled: false,
          totpEnabled: false,
        }),
      ]);
      expect(
        (await call('PATCH', `admin/users/${lidId}`, staff, { role: 'ADMIN' })).statusCode,
      ).toBe(403);
    });

    it('wijzigt een rol: sessies vervallen en de nieuwe rechten gelden direct', async () => {
      expect((await call('GET', 'staff/ping', lid)).statusCode).toBe(403);
      const res = await call('PATCH', `admin/users/${lidId}`, admin, { role: 'LIBRARIAN' });
      expect(res.json()).toMatchObject({ role: 'LIBRARIAN' });
      expect((await call('GET', 'auth/me', lid)).statusCode).toBe(401); // oude sessie ingetrokken
      const again = await login(app, 'lid@example.nl');
      expect((await call('GET', 'staff/ping', again)).statusCode).toBe(200);
      expect(
        (await call('PATCH', `admin/users/${lidId}`, admin, { role: 'SUPERUSER' })).statusCode,
      ).toBe(400);
      expect(
        (await call('PATCH', 'admin/users/999999', admin, { role: 'MEMBER' })).statusCode,
      ).toBe(404);
    });

    it('voorkomt zelf-uitsluiting en het verwijderen van de laatste beheerder', async () => {
      expect(
        (await call('PATCH', `admin/users/${adminId}`, admin, { role: 'MEMBER' })).json().code,
      ).toBe('SELF_LOCKOUT');
      expect(
        (await call('PATCH', `admin/users/${adminId}`, admin, { disabled: true })).json().code,
      ).toBe('SELF_LOCKOUT');
      // tweede admin die de eerste degradeert mag, maar de allerlaatste blijft
      await call('PATCH', `admin/users/${lidId}`, admin, { role: 'ADMIN' });
      const second = await login(app, 'lid@example.nl');
      expect(
        (await call('PATCH', `admin/users/${adminId}`, second, { role: 'MEMBER' })).statusCode,
      ).toBe(200);
      expect(
        (await call('PATCH', `admin/users/${lidId}`, second, { role: 'MEMBER' })).json().code,
      ).toBe('SELF_LOCKOUT');
    });

    it('een uitgeschakeld account kan niet meer inloggen en verliest zijn sessie', async () => {
      expect(
        (await call('PATCH', `admin/users/${lidId}`, admin, { disabled: true })).json(),
      ).toMatchObject({ disabled: true });
      expect((await call('GET', 'auth/me', lid)).statusCode).toBe(401);
      const res = await login(app, 'lid@example.nl');
      expect(res.res.statusCode).toBe(403);
      expect(res.res.json().code).toBe('ACCOUNT_DISABLED');
      await call('PATCH', `admin/users/${lidId}`, admin, { disabled: false });
      expect((await login(app, 'lid@example.nl')).res.statusCode).toBe(200);
    });
  });

  describe('auditlog', () => {
    it('toont acties met filters en paginering, alleen voor beheerders', async () => {
      await call('PATCH', `admin/users/${lidId}`, admin, { role: 'LIBRARIAN' });
      expect((await call('GET', 'admin/audit', staff)).statusCode).toBe(403);
      const all = (await call('GET', 'admin/audit', admin)).json();
      expect(all.total).toBeGreaterThan(3);
      expect(all.items[0]).toMatchObject({
        action: 'admin.user_update',
        userEmail: 'admin@example.nl',
      });
      expect(all.items[0].detail).toContain(`"userId":${lidId}`);
      expect(
        (await call('GET', 'admin/audit?action=auth.login', admin))
          .json()
          .items.every((i: { action: string }) => i.action.startsWith('auth.login')),
      ).toBe(true);
      expect(
        (await call('GET', `admin/audit?userId=${adminId}&action=admin`, admin)).json().total,
      ).toBe(1);
      const page2 = (await call('GET', 'admin/audit?page=2', admin)).json();
      expect(page2.page).toBe(2);
    });
  });

  describe('e-mailtemplates', () => {
    it('toont standaardteksten en past een aangepaste tekst toe op nieuwe meldingen; resetten herstelt', async () => {
      const list = (await call('GET', 'admin/email-templates', admin)).json();
      expect(list).toHaveLength(16); // 8 soorten × 2 talen
      const ready = list.find(
        (t: { type: string; locale: string }) =>
          t.type === 'RESERVATION_READY' && t.locale === 'nl',
      );
      expect(ready).toMatchObject({ customized: false, subject: 'Je reservering ligt klaar' });
      expect(ready.placeholders).toContain('title');
      expect(
        (
          await call('PUT', 'admin/email-templates/RESERVATION_READY/nl', staff, {
            subject: 'x',
            body: 'y',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await call('PUT', 'admin/email-templates/NOPE/nl', admin, { subject: 'x', body: 'y' }))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await call('PUT', 'admin/email-templates/RESERVATION_READY/nl', admin, {
            subject: '',
            body: 'y',
          })
        ).statusCode,
      ).toBe(400);

      const saved = await call('PUT', 'admin/email-templates/RESERVATION_READY/nl', admin, {
        subject: 'Hoera, {{title}} is er!',
        body: 'Haal {{title}} op vóór {{date}}.',
      });
      expect(saved.json()).toMatchObject({ customized: true, subject: 'Hoera, {{title}} is er!' });

      // Nieuwe reservering → melding met de aangepaste tekst
      const book = await prisma.book.create({ data: { title: 'Het diner' } });
      const copy = await prisma.copy.create({
        data: { bookId: book.id, barcode: 'D1', status: 'LOANED' },
      });
      await prisma.loan.create({
        data: { copyId: copy.id, memberId: lidMemberId, dueAt: new Date(Date.now() + DAY) },
      });
      const other = await createUser(prisma, 'ander@example.nl', 'MEMBER');
      const otherSession = await login(app, 'ander@example.nl');
      expect(
        (await call('POST', 'me/reservations', otherSession, { bookId: book.id })).statusCode,
      ).toBe(201);
      await call('POST', 'staff/loans/checkin', staff, { barcode: 'D1' });
      const n = await prisma.notification.findFirstOrThrow({ where: { userId: other.id } });
      expect(n.title).toBe('Hoera, Het diner is er!');
      expect(n.body).toMatch(/^Haal Het diner op vóór \d+ \w+ 2026\.$/);
      expect(mail.last('ander@example.nl')?.subject).toBe('Hoera, Het diner is er!');

      expect(
        (await call('DELETE', 'admin/email-templates/RESERVATION_READY/nl', admin)).statusCode,
      ).toBe(204);
      expect(
        (await call('GET', 'admin/email-templates', admin))
          .json()
          .find(
            (t: { type: string; locale: string }) =>
              t.type === 'RESERVATION_READY' && t.locale === 'nl',
          ).customized,
      ).toBe(false);
    });
  });
});
