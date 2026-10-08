import { request as httpRequest } from 'node:http';
import { AddressInfo } from 'node:net';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { MaintenanceService } from '../src/reservations/maintenance.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, createUser, login, MailStub, resetCatalog, resetDb } from './helpers';

process.env.AUTH_RATE_LIMIT_MAX = '1000';

type Who = { cookie: string; csrf: string };
const DAY = 86400000;

describe('Reserveringen en meldingen (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let mail: MailStub;
  let maintenance: MaintenanceService;
  let staff: Who;
  let admin: Who;
  let bookId: number;
  const members: Record<string, { who: Who; memberNumber: string; userId: number }> = {};

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, who?: Who, payload?: object) =>
    app.inject({
      method,
      url: `/api/${url}`,
      payload,
      headers: who ? { cookie: who.cookie, 'x-csrf-token': who.csrf } : {},
    });
  const checkout = (memberNumber: string, barcode: string) =>
    call('POST', 'staff/loans/checkout', staff, { memberNumber, barcode });
  const checkin = (barcode: string) => call('POST', 'staff/loans/checkin', staff, { barcode });
  const reserve = (name: string, id = bookId) =>
    call('POST', 'me/reservations', members[name]!.who, { bookId: id });
  const copyStatus = async (barcode: string) =>
    (await prisma.copy.findUniqueOrThrow({ where: { barcode } })).status;
  const notifications = (name: string) =>
    prisma.notification.findMany({
      where: { userId: members[name]!.userId },
      orderBy: { id: 'asc' },
    });

  async function addMember(name: string, locale = 'nl') {
    const email = `${name}@example.nl`;
    const u = await createUser(prisma, email, 'MEMBER');
    if (locale !== 'nl') await prisma.user.update({ where: { id: u.id }, data: { locale } });
    const m = await prisma.member.findUniqueOrThrow({ where: { userId: u.id } });
    members[name] = { who: await login(app, email), memberNumber: m.memberNumber, userId: u.id };
  }
  const addCopy = (
    barcode: string,
    status: 'AVAILABLE' | 'LOANED' | 'LOST' = 'AVAILABLE',
    book = bookId,
  ) => prisma.copy.create({ data: { barcode, bookId: book, status } });

  /** Zet het boek in een staat waarin alle exemplaren zijn uitgeleend aan `holder`. */
  async function loanOut(holder: string, ...barcodes: string[]) {
    for (const b of barcodes) {
      await addCopy(b);
      expect((await checkout(members[holder]!.memberNumber, b)).statusCode).toBe(201);
    }
  }

  beforeAll(async () => {
    ({ app, prisma, mail } = await createApp());
    maintenance = app.get(MaintenanceService);
  });
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.fine.deleteMany();
    await prisma.loan.deleteMany();
    await prisma.setting.deleteMany();
    await resetCatalog(prisma);
    await resetDb(prisma);
    mail.sent.length = 0;
    await createUser(prisma, 'bib@example.nl', 'LIBRARIAN');
    await createUser(prisma, 'admin@example.nl', 'ADMIN');
    staff = await login(app, 'bib@example.nl');
    admin = await login(app, 'admin@example.nl');
    for (const n of ['anna', 'bram', 'carla', 'dirk']) await addMember(n);
    bookId = (await prisma.book.create({ data: { title: 'Het diner' } })).id;
  });
  afterAll(() => app.close());

  describe('reserveren', () => {
    it('weigert reserveren als er een exemplaar beschikbaar is, of zonder exemplaren', async () => {
      expect((await reserve('anna')).json().code).toBe('NO_COPIES');
      await addCopy('C1');
      expect((await reserve('anna')).json().code).toBe('AVAILABLE_NOW');
      await addCopy('C2', 'LOST');
      expect((await reserve('anna')).statusCode).toBe(409);
    });

    it('zet leden in een wachtrij met posities; dubbel reserveren en eigen boek kunnen niet', async () => {
      await loanOut('dirk', 'C1');
      const a = await reserve('anna');
      expect(a.statusCode).toBe(201);
      expect(a.json()).toMatchObject({ status: 'WAITING', position: 1, title: 'Het diner' });
      expect((await reserve('bram')).json().position).toBe(2);
      expect((await reserve('carla')).json().position).toBe(3);
      expect((await reserve('anna')).json().code).toBe('ALREADY_RESERVED');
      expect((await reserve('dirk')).json().code).toBe('ALREADY_BORROWED');
      expect((await call('GET', 'me/reservations', members.bram!.who)).json()).toMatchObject([
        { position: 2 },
      ]);
      expect((await call('GET', `books/${bookId}`)).json().reservationsWaiting).toBe(3);
    });

    it('past blokkade, verlopen lidmaatschap, limiet en authenticatie toe', async () => {
      await loanOut('dirk', 'C1');
      await prisma.member.update({
        where: { userId: members.anna!.userId },
        data: { blocked: true },
      });
      expect((await reserve('anna')).json().code).toBe('MEMBER_BLOCKED');
      await prisma.member.update({
        where: { userId: members.bram!.userId },
        data: { membershipUntil: new Date(Date.now() - DAY) },
      });
      expect((await reserve('bram')).json().code).toBe('MEMBERSHIP_EXPIRED');
      expect((await call('POST', 'me/reservations', undefined, { bookId })).statusCode).toBe(401);
      expect(
        (await call('POST', 'me/reservations', members.carla!.who, { bookId: 99999 })).statusCode,
      ).toBe(404);
      expect(
        (await call('POST', 'me/reservations', members.carla!.who, { bookId: 'x' })).statusCode,
      ).toBe(400);

      await prisma.setting.create({ data: { key: 'maxReservationsPerMember', value: 1 } });
      const other = (await prisma.book.create({ data: { title: 'Ander boek' } })).id;
      await addCopy('O1', 'AVAILABLE', other);
      await checkout(members.dirk!.memberNumber, 'O1');
      expect((await reserve('carla')).statusCode).toBe(201);
      expect((await reserve('carla', other)).json().code).toBe('RESERVATION_LIMIT');
    });

    it('gelijktijdig reserveren geeft unieke, aaneengesloten posities', async () => {
      await loanOut('dirk', 'C1');
      const names = ['anna', 'bram', 'carla'];
      const res = await Promise.all(names.map((n) => reserve(n)));
      expect(res.map((r) => r.statusCode)).toEqual([201, 201, 201]);
      const ids = res.map((r) => r.json().id);
      const positions = await Promise.all(
        ids.map(async (id) => (await prisma.reservation.findUniqueOrThrow({ where: { id } })).id),
      );
      expect(new Set(positions).size).toBe(3);
      const queue = (await call('GET', 'staff/reservations', staff)).json() as {
        position: number;
      }[];
      expect(queue.map((q) => q.position).sort()).toEqual([1, 2, 3]);
    });
  });

  describe('wachtrij en ophalen', () => {
    it('geeft een ingeleverd exemplaar aan de eerste in de rij, met melding en e-mail', async () => {
      await loanOut('dirk', 'C1');
      await reserve('anna');
      await reserve('bram');

      const res = await checkin('C1');
      expect(res.json().reservedFor).toBe('anna');
      expect(await copyStatus('C1')).toBe('RESERVED_HOLD');
      const [ra, rb] = await Promise.all(
        ['anna', 'bram'].map((n) =>
          call('GET', 'me/reservations', members[n]!.who).then((r) => r.json()[0]),
        ),
      );
      expect(ra).toMatchObject({ status: 'READY', position: null });
      expect(new Date(ra.expiresAt).getTime() - Date.now()).toBeGreaterThan(4.9 * DAY);
      expect(rb).toMatchObject({ status: 'WAITING', position: 1 });

      const n = await notifications('anna');
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ type: 'RESERVATION_READY', title: 'Je reservering ligt klaar' });
      expect(n[0]!.body).toContain('Het diner');
      expect(mail.last('anna@example.nl')?.subject).toBe('Je reservering ligt klaar');
      expect(await notifications('bram')).toHaveLength(0);
      expect((await call('GET', `books/${bookId}`)).json()).toMatchObject({ copiesAvailable: 0 });
    });

    it('stuurt meldingen in de taal van het lid', async () => {
      await addMember('emma', 'en');
      await loanOut('dirk', 'C1');
      await reserve('emma');
      await checkin('C1');
      expect(mail.last('emma@example.nl')?.subject).toBe('Your reservation is ready');
    });

    it('laat een klaargelegd exemplaar alleen uitlenen aan de reserveerder', async () => {
      await loanOut('dirk', 'C1');
      await reserve('anna');
      await reserve('bram');
      await checkin('C1');
      const other = await checkout(members.bram!.memberNumber, 'C1');
      expect(other.statusCode).toBe(409);
      expect(other.json().code).toBe('COPY_RESERVED_HOLD');
      expect((await checkout(members.anna!.memberNumber, 'C1')).statusCode).toBe(201);
      expect(await copyStatus('C1')).toBe('LOANED');
      expect(
        (
          await prisma.reservation.findFirstOrThrow({
            where: { member: { userId: members.anna!.userId } },
          })
        ).status,
      ).toBe('FULFILLED');
      // Bram blijft wachten op de volgende teruggave
      expect((await call('GET', 'me/reservations', members.bram!.who)).json()[0]).toMatchObject({
        status: 'WAITING',
        position: 1,
      });
    });

    it('sluit de reservering ook als het lid een ander exemplaar leent en geeft het klaargelegde vrij', async () => {
      await loanOut('dirk', 'C1', 'C2');
      await reserve('anna');
      await reserve('bram');
      await checkin('C1'); // → Anna (hold)
      await checkin('C2'); // → Bram (hold)
      // Anna leent C2 in plaats van C1? C2 is voor Bram geblokkeerd; ze kan wel een nieuw exemplaar krijgen:
      await addCopy('C3');
      // nieuw exemplaar: geen wachtenden meer → blijft AVAILABLE
      expect(await copyStatus('C3')).toBe('AVAILABLE');
      expect((await checkout(members.anna!.memberNumber, 'C3')).statusCode).toBe(201);
      expect(
        (
          await prisma.reservation.findFirstOrThrow({
            where: { member: { userId: members.anna!.userId } },
          })
        ).status,
      ).toBe('FULFILLED');
      expect(await copyStatus('C1')).toBe('AVAILABLE'); // vrijgegeven
    });

    it('verdeelt parallel ingeleverde exemplaren over de wachtenden zonder dubbele toewijzing', async () => {
      await addMember('eva');
      await addMember('finn');
      await loanOut('dirk', 'C1', 'C2', 'C3');
      for (const n of ['anna', 'bram', 'carla', 'eva', 'finn']) await reserve(n);
      const results = await Promise.all(['C1', 'C2', 'C3'].map((b) => checkin(b)));
      expect(results.every((r) => r.statusCode === 200)).toBe(true);
      const ready = await prisma.reservation.findMany({
        where: { status: 'READY' },
        orderBy: { createdAt: 'asc' },
      });
      expect(ready).toHaveLength(3);
      expect(new Set(ready.map((r) => r.copyId)).size).toBe(3);
      const waiting = await prisma.reservation.count({ where: { status: 'WAITING' } });
      expect(waiting).toBe(2);
      // eerste drie in de rij hebben een exemplaar
      const holders = await prisma.reservation.findMany({
        where: { status: 'READY' },
        include: { member: { include: { user: true } } },
      });
      expect(holders.map((h) => h.member.user.email).sort()).toEqual([
        'anna@example.nl',
        'bram@example.nl',
        'carla@example.nl',
      ]);
    });
  });

  describe('annuleren en verlopen', () => {
    it('annuleren van een wachtende schuift de rij op; van een klaarliggende geeft door aan de volgende', async () => {
      await loanOut('dirk', 'C1');
      const a = (await reserve('anna')).json();
      const b = (await reserve('bram')).json();
      await reserve('carla');
      expect(
        (await call('POST', `me/reservations/${b.id}/cancel`, members.anna!.who)).statusCode,
      ).toBe(404); // niet van Anna
      expect(
        (await call('POST', `me/reservations/${b.id}/cancel`, members.bram!.who)).json().status,
      ).toBe('CANCELLED');
      expect((await call('GET', 'me/reservations', members.carla!.who)).json()[0].position).toBe(2);

      await checkin('C1'); // Anna krijgt hem
      expect(
        (await call('POST', `me/reservations/${a.id}/cancel`, members.anna!.who)).json().status,
      ).toBe('CANCELLED');
      expect(await copyStatus('C1')).toBe('RESERVED_HOLD'); // direct naar Carla
      expect((await call('GET', 'me/reservations', members.carla!.who)).json()[0].status).toBe(
        'READY',
      );
      expect(
        (await call('POST', `me/reservations/${a.id}/cancel`, members.anna!.who)).json().code,
      ).toBe('RESERVATION_CLOSED');
    });

    it('zonder wachtenden komt een geannuleerd exemplaar weer beschikbaar', async () => {
      await loanOut('dirk', 'C1');
      const a = (await reserve('anna')).json();
      await checkin('C1');
      expect(await copyStatus('C1')).toBe('RESERVED_HOLD');
      await call('POST', `staff/reservations/${a.id}/cancel`, staff);
      expect(await copyStatus('C1')).toBe('AVAILABLE');
    });

    it('verlopen reserveringen schuiven nachtelijk door en melden dit', async () => {
      await loanOut('dirk', 'C1');
      await reserve('anna');
      await reserve('bram');
      await checkin('C1');
      await prisma.reservation.updateMany({
        where: { status: 'READY' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await call('POST', 'admin/jobs/nightly', admin);
      expect(res.json()).toMatchObject({ reservationsExpired: 1 });
      expect(
        (
          await prisma.reservation.findFirstOrThrow({
            where: { member: { userId: members.anna!.userId } },
          })
        ).status,
      ).toBe('EXPIRED');
      expect((await notifications('anna')).map((n) => n.type)).toEqual([
        'RESERVATION_READY',
        'RESERVATION_EXPIRED',
      ]);
      expect((await call('GET', 'me/reservations', members.bram!.who)).json()[0].status).toBe(
        'READY',
      );
      expect((await notifications('bram')).map((n) => n.type)).toEqual(['RESERVATION_READY']);
      expect(await copyStatus('C1')).toBe('RESERVED_HOLD');
      // tweede run is idempotent
      expect((await maintenance.runNightly()).reservationsExpired).toBe(0);
    });

    it('een nieuw of weer beschikbaar gemeld exemplaar gaat naar de wachtrij', async () => {
      await loanOut('dirk', 'C1');
      await reserve('anna');
      const added = await call('POST', `staff/books/${bookId}/copies`, staff, { barcode: 'NEW1' });
      expect(added.statusCode).toBe(201);
      expect(await copyStatus('NEW1')).toBe('RESERVED_HOLD');
      expect((await call('GET', 'me/reservations', members.anna!.who)).json()[0].status).toBe(
        'READY',
      );

      // staff markeert het klaargelegde exemplaar als beschadigd → Anna wacht weer
      const copy = await prisma.copy.findUniqueOrThrow({ where: { barcode: 'NEW1' } });
      expect(
        (await call('PATCH', `staff/copies/${copy.id}`, staff, { status: 'DAMAGED' })).statusCode,
      ).toBe(200);
      expect((await call('GET', 'me/reservations', members.anna!.who)).json()[0]).toMatchObject({
        status: 'WAITING',
        position: 1,
      });
      expect(
        (await call('PATCH', `staff/copies/${copy.id}`, staff, { status: 'RESERVED_HOLD' }))
          .statusCode,
      ).toBe(409);
      // en daarna weer in orde → direct naar Anna
      await call('PATCH', `staff/copies/${copy.id}`, staff, { status: 'AVAILABLE' });
      expect((await call('GET', 'me/reservations', members.anna!.who)).json()[0].status).toBe(
        'READY',
      );
    });

    it('blokkeert verlengen zodra iemand wacht', async () => {
      await loanOut('dirk', 'C1');
      const loan = await prisma.loan.findFirstOrThrow({});
      const dirk = members.dirk!.who;
      expect((await call('POST', `me/loans/${loan.id}/renew`, dirk)).statusCode).toBe(200);
      await reserve('anna');
      const res = await call('POST', `me/loans/${loan.id}/renew`, dirk);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('RESERVED');
    });
  });

  describe('nachtelijke jobs', () => {
    it('stuurt één herinnering vóór de uiterste datum', async () => {
      await loanOut('anna', 'C1');
      await addCopy('C2');
      await checkout(members.bram!.memberNumber, 'C2');
      await prisma.loan.updateMany({
        where: { copy: { barcode: 'C1' } },
        data: { dueAt: new Date(Date.now() + 1 * DAY) },
      });
      // C2 heeft nog 21 dagen: geen herinnering

      expect((await maintenance.runNightly()).reminders).toBe(1);
      expect((await notifications('anna')).map((n) => n.type)).toEqual(['LOAN_DUE_SOON']);
      expect(await notifications('bram')).toHaveLength(0);
      expect(mail.last('anna@example.nl')?.subject).toBe('Je boek moet bijna terug');
      expect((await maintenance.runNightly()).reminders).toBe(0);
      expect(await notifications('anna')).toHaveLength(1);
    });

    it('berekent boetes voor te late boeken, meldt dit periodiek en past de boete bij inname aan', async () => {
      await loanOut('anna', 'C1');
      const loan = await prisma.loan.findFirstOrThrow({});
      await prisma.loan.update({
        where: { id: loan.id },
        data: { dueAt: new Date(Date.now() - 3.5 * DAY) },
      });

      let r = await maintenance.runNightly();
      expect(r).toMatchObject({ finesUpdated: 1, overdueNotices: 1 });
      let fines = await prisma.fine.findMany({});
      expect(fines).toHaveLength(1);
      expect(fines[0]).toMatchObject({ reason: 'OVERDUE', amountCents: 100 }); // 4 dagen × 25
      const [notice] = await notifications('anna');
      expect(notice).toMatchObject({ type: 'LOAN_OVERDUE' });
      expect(notice!.body).toContain('4 dag(en) te laat');

      // zelfde dag nog een keer: niets nieuws
      r = await maintenance.runNightly();
      expect(r).toMatchObject({ finesUpdated: 0, overdueNotices: 0 });

      // een week later: boete groeit, nieuwe aanmaning
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          dueAt: new Date(Date.now() - 10.5 * DAY),
          overdueNoticeAt: new Date(Date.now() - 8 * DAY),
        },
      });
      r = await maintenance.runNightly();
      expect(r).toMatchObject({ finesUpdated: 1, overdueNotices: 1 });
      fines = await prisma.fine.findMany({});
      expect(fines).toHaveLength(1);
      expect(fines[0]!.amountCents).toBe(275); // 11 × 25

      // inname: dezelfde boete wordt bijgewerkt, niet verdubbeld
      const res = (await checkin('C1')).json();
      expect(res.fine.id).toBe(fines[0]!.id);
      expect(await prisma.fine.count()).toBe(1);
      expect(res.fine.amountCents).toBe(275);
      // na inname geen nachtelijke boete meer
      expect((await maintenance.runNightly()).finesUpdated).toBe(0);
    });

    it('rekent het maximum en laat kwijtgescholden boetes met rust', async () => {
      await loanOut('anna', 'C1');
      const loan = await prisma.loan.findFirstOrThrow({});
      await prisma.loan.update({
        where: { id: loan.id },
        data: { dueAt: new Date(Date.now() - 500 * DAY) },
      });
      await maintenance.runNightly();
      const fine = await prisma.fine.findFirstOrThrow({});
      expect(fine.amountCents).toBe(1500);
      await prisma.fine.update({
        where: { id: fine.id },
        data: { waivedAt: new Date(), amountCents: 100 },
      });
      await prisma.loan.update({
        where: { id: loan.id },
        data: { dueAt: new Date(Date.now() - 600 * DAY) },
      });
      expect((await maintenance.runNightly()).finesUpdated).toBe(0);
      expect((await prisma.fine.findFirstOrThrow({})).amountCents).toBe(100);
    });

    it('waarschuwt eenmaal voor aflopend lidmaatschap', async () => {
      await prisma.member.update({
        where: { userId: members.anna!.userId },
        data: { membershipUntil: new Date(Date.now() + 5 * DAY) },
      });
      expect((await maintenance.runNightly()).membershipNotices).toBe(1);
      expect((await notifications('anna')).map((n) => n.type)).toEqual(['MEMBERSHIP_EXPIRING']);
      expect((await maintenance.runNightly()).membershipNotices).toBe(0);
      // na verlenging en opnieuw bijna verlopen: nieuwe melding
      await prisma.member.update({
        where: { userId: members.anna!.userId },
        data: { membershipUntil: new Date(Date.now() + 6 * DAY) },
      });
      expect((await maintenance.runNightly()).membershipNotices).toBe(1);
    });

    it('alleen beheerders starten de job handmatig; medewerkers sturen aanmaningen', async () => {
      expect((await call('POST', 'admin/jobs/nightly', staff)).statusCode).toBe(403);
      await loanOut('anna', 'C1');
      const loan = await prisma.loan.findFirstOrThrow({});
      await prisma.loan.update({
        where: { id: loan.id },
        data: { dueAt: new Date(Date.now() - 1.5 * DAY) },
      });
      expect((await call('POST', `staff/loans/${loan.id}/remind`, staff)).statusCode).toBe(204);
      expect((await notifications('anna')).map((n) => n.type)).toEqual(['LOAN_OVERDUE']);
      const overview = (await call('GET', 'staff/loans?status=overdue', staff)).json();
      expect(overview[0]).toMatchObject({ overdue: true, daysLate: 2 });
      expect(overview[0].lastNoticeAt).toBeTruthy();
      await checkin('C1');
      expect((await call('POST', `staff/loans/${loan.id}/remind`, staff)).json().code).toBe(
        'LOAN_CLOSED',
      );
    });
  });

  describe('meldingen en realtime', () => {
    it('toont, markeert en filtert eigen meldingen', async () => {
      await loanOut('dirk', 'C1');
      await reserve('anna');
      await checkin('C1');
      const list = (await call('GET', 'me/notifications', members.anna!.who)).json();
      expect(list.unread).toBe(1);
      expect(list.items[0]).toMatchObject({ type: 'RESERVATION_READY', readAt: null });
      expect((await call('GET', 'me/notifications?unread=true', members.bram!.who)).json()).toEqual(
        { items: [], unread: 0 },
      );
      expect(
        (await call('POST', `me/notifications/${list.items[0].id}/read`, members.bram!.who))
          .statusCode,
      ).toBe(404);
      expect(
        (await call('POST', `me/notifications/${list.items[0].id}/read`, members.anna!.who))
          .statusCode,
      ).toBe(204);
      expect((await call('GET', 'me/notifications', members.anna!.who)).json().unread).toBe(0);
      await call('POST', 'me/notifications/read-all', members.anna!.who);
      expect((await call('GET', 'me/notifications', undefined)).statusCode).toBe(401);
    });

    it('streamt beschikbaarheid naar iedereen en meldingen alleen naar de eigenaar (SSE)', async () => {
      await loanOut('dirk', 'C1');
      await reserve('anna');
      await app.listen(0, '127.0.0.1');
      const port = (app.getHttpServer().address() as AddressInfo).port;

      const open = (cookie?: string) => {
        const received: string[] = [];
        const req = httpRequest(
          { host: '127.0.0.1', port, path: '/api/events', headers: cookie ? { cookie } : {} },
          (res) => {
            res.setEncoding('utf8');
            res.on('data', (c: string) => received.push(c));
          },
        );
        req.end();
        return { received, close: () => req.destroy() };
      };
      const anna = open(members.anna!.who.cookie);
      const bram = open(members.bram!.who.cookie);
      const anon = open();
      await new Promise((r) => setTimeout(r, 300));

      await checkin('C1');
      await new Promise((r) => setTimeout(r, 400));
      const text = (s: { received: string[] }) => s.received.join('');
      expect(text(anna)).toContain('event: availability');
      expect(text(anna)).toContain('event: notification');
      expect(text(anna)).toContain('Je reservering ligt klaar');
      expect(text(bram)).toContain('event: availability');
      expect(text(bram)).not.toContain('event: notification');
      expect(text(anon)).toContain('event: availability');
      expect(text(anon)).not.toContain('notification');
      [anna, bram, anon].forEach((s) => s.close());
    });
  });
});
