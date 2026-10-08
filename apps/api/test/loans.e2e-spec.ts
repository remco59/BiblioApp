import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { LoansService } from '../src/loans/loans.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, createUser, login, resetCatalog, resetDb } from './helpers';

process.env.AUTH_RATE_LIMIT_MAX = '1000';

type Who = { cookie: string; csrf: string };
const DAY = 86400000;

describe('Uitleenproces (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let staff: Who;
  let admin: Who;
  let lid: Who;
  let lidMember: { id: number; memberNumber: string };
  let bookId: number;

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, who?: Who, payload?: object) =>
    app.inject({
      method,
      url: `/api/${url}`,
      payload,
      headers: who ? { cookie: who.cookie, 'x-csrf-token': who.csrf } : {},
    });
  const checkout = (memberNumber: string, barcode: string, who = staff) =>
    call('POST', 'staff/loans/checkout', who, { memberNumber, barcode });
  const checkin = (barcode: string, condition?: 'OK' | 'DAMAGED') =>
    call('POST', 'staff/loans/checkin', staff, { barcode, condition });

  async function addCopy(
    barcode: string,
    status: 'AVAILABLE' | 'LOANED' | 'RESERVED_HOLD' | 'LOST' | 'DAMAGED' = 'AVAILABLE',
  ) {
    return prisma.copy.create({ data: { barcode, bookId, status } });
  }
  async function addMember(email: string) {
    const u = await createUser(prisma, email, 'MEMBER');
    return prisma.member.findUniqueOrThrow({ where: { userId: u.id } });
  }

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await prisma.payment.deleteMany();
    await prisma.fine.deleteMany();
    await prisma.loan.deleteMany();
    await prisma.setting.deleteMany();
    await resetCatalog(prisma);
    await resetDb(prisma);
    await createUser(prisma, 'bib@example.nl', 'LIBRARIAN');
    await createUser(prisma, 'admin@example.nl', 'ADMIN');
    const u = await createUser(prisma, 'lid@example.nl', 'MEMBER');
    lidMember = await prisma.member.findUniqueOrThrow({ where: { userId: u.id } });
    staff = await login(app, 'bib@example.nl');
    admin = await login(app, 'admin@example.nl');
    lid = await login(app, 'lid@example.nl');
    bookId = (await prisma.book.create({ data: { title: 'Het diner' } })).id;
  });
  afterAll(() => app.close());

  describe('uitlenen', () => {
    it('leent uit, zet het exemplaar op LOANED en berekent de uiterste datum', async () => {
      await addCopy('C1');
      const res = await checkout(lidMember.memberNumber, 'C1');
      expect(res.statusCode).toBe(201);
      const loan = res.json();
      expect(loan).toMatchObject({
        title: 'Het diner',
        barcode: 'C1',
        memberNumber: lidMember.memberNumber,
        renewals: 0,
        overdue: false,
        canRenew: true,
      });
      const days = (new Date(loan.dueAt).getTime() - new Date(loan.loanedAt).getTime()) / DAY;
      expect(days).toBeCloseTo(21, 1);
      expect((await prisma.copy.findUniqueOrThrow({ where: { barcode: 'C1' } })).status).toBe(
        'LOANED',
      );
      expect((await call('GET', `books/${bookId}`)).json()).toMatchObject({
        copiesTotal: 1,
        copiesAvailable: 0,
      });
      expect((await prisma.auditLog.findMany({ where: { action: 'loan.checkout' } })).length).toBe(
        1,
      );
    });

    it('weigert medewerker-acties voor leden en anonieme gebruikers', async () => {
      await addCopy('C1');
      expect((await checkout(lidMember.memberNumber, 'C1', lid)).statusCode).toBe(403);
      expect(
        (
          await call('POST', 'staff/loans/checkout', undefined, {
            memberNumber: 'x',
            barcode: 'C1',
          })
        ).statusCode,
      ).toBe(401);
    });

    it.each([
      ['al uitgeleend', 'LOANED', 409, 'COPY_LOANED'],
      ['klaargelegd voor een reservering', 'RESERVED_HOLD', 409, 'COPY_RESERVED_HOLD'],
      ['verloren', 'LOST', 409, 'COPY_LOST'],
      ['beschadigd', 'DAMAGED', 409, 'COPY_DAMAGED'],
    ] as const)('weigert een exemplaar dat %s is', async (_label, status, http, code) => {
      await addCopy('C1', status);
      const res = await checkout(lidMember.memberNumber, 'C1');
      expect(res.statusCode).toBe(http);
      expect(res.json().code).toBe(code);
    });

    it('geeft 404 bij onbekend exemplaar of lid', async () => {
      await addCopy('C1');
      expect((await checkout(lidMember.memberNumber, 'NOPE')).json().code).toBe('COPY_NOT_FOUND');
      expect((await checkout('GEENLID', 'C1')).json().code).toBe('MEMBER_NOT_FOUND');
    });

    it('controleert blokkade, lidmaatschap, boetes en leenlimiet', async () => {
      await addCopy('C1');
      await addCopy('C2');
      await addCopy('C3');

      await prisma.member.update({
        where: { id: lidMember.id },
        data: { blocked: true, blockedReason: 'Te veel achterstand' },
      });
      let res = await checkout(lidMember.memberNumber, 'C1');
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'MEMBER_BLOCKED' });
      expect(res.json().message).toContain('Te veel achterstand');
      await prisma.member.update({
        where: { id: lidMember.id },
        data: { blocked: false, blockedReason: null },
      });

      await prisma.member.update({
        where: { id: lidMember.id },
        data: { membershipUntil: new Date(Date.now() - DAY) },
      });
      expect((await checkout(lidMember.memberNumber, 'C1')).json().code).toBe('MEMBERSHIP_EXPIRED');
      await prisma.member.update({
        where: { id: lidMember.id },
        data: { membershipUntil: new Date(Date.now() + DAY) },
      });

      await prisma.fine.create({
        data: { memberId: lidMember.id, reason: 'OVERDUE', amountCents: 600 },
      });
      expect((await checkout(lidMember.memberNumber, 'C1')).json().code).toBe('OUTSTANDING_FINES');
      await prisma.fine.deleteMany();
      await prisma.fine.create({
        data: { memberId: lidMember.id, reason: 'OVERDUE', amountCents: 100 },
      }); // onder de drempel
      expect((await checkout(lidMember.memberNumber, 'C1')).statusCode).toBe(201);

      await prisma.setting.create({ data: { key: 'maxLoansPerMember', value: 2 } });
      expect((await checkout(lidMember.memberNumber, 'C2')).statusCode).toBe(201);
      res = await checkout(lidMember.memberNumber, 'C3');
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('LOAN_LIMIT');
    });
  });

  describe('gelijktijdigheid', () => {
    it('leent één exemplaar nooit dubbel uit bij parallelle verzoeken', async () => {
      await addCopy('RACE');
      const members = await Promise.all(
        Array.from({ length: 8 }, (_, i) => addMember(`race${i}@example.nl`)),
      );
      const results = await Promise.all(members.map((m) => checkout(m.memberNumber, 'RACE')));
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);
      expect(await prisma.loan.count({ where: { returnedAt: null } })).toBe(1);
    });

    it('houdt de leenlimiet van één lid intact bij parallelle verzoeken', async () => {
      await prisma.setting.create({ data: { key: 'maxLoansPerMember', value: 3 } });
      for (let i = 0; i < 8; i++) await addCopy(`LIM${i}`);
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => checkout(lidMember.memberNumber, `LIM${i}`)),
      );
      expect(results.filter((r) => r.statusCode === 201)).toHaveLength(3);
      expect(
        results.filter((r) => r.statusCode === 403 && r.json().code === 'LOAN_LIMIT'),
      ).toHaveLength(5);
      expect(await prisma.loan.count({ where: { memberId: lidMember.id, returnedAt: null } })).toBe(
        3,
      );
    });

    it('de database weigert zelf ook een tweede actieve uitleen (vangnet)', async () => {
      const copy = await addCopy('DB');
      const data = { copyId: copy.id, memberId: lidMember.id, dueAt: new Date(Date.now() + DAY) };
      await prisma.loan.create({ data });
      await expect(prisma.loan.create({ data })).rejects.toThrow();
    });
  });

  describe('innemen en boetes', () => {
    it('neemt op tijd in zonder boete', async () => {
      await addCopy('C1');
      await checkout(lidMember.memberNumber, 'C1');
      const res = await checkin('C1');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ daysLate: 0, fine: null, loan: { outcome: 'RETURNED' } });
      expect((await prisma.copy.findUniqueOrThrow({ where: { barcode: 'C1' } })).status).toBe(
        'AVAILABLE',
      );
      expect((await checkin('C1')).json().code).toBe('NOT_ON_LOAN');
      expect((await checkin('NOPE')).statusCode).toBe(404);
    });

    it('rekent een boete per begonnen dag te laat, met maximum', async () => {
      await addCopy('C1');
      await addCopy('C2');
      await checkout(lidMember.memberNumber, 'C1');
      await prisma.loan.updateMany({
        where: { copy: { barcode: 'C1' } },
        data: { dueAt: new Date(Date.now() - 4.5 * DAY) },
      });
      const res = (await checkin('C1')).json();
      expect(res.daysLate).toBe(5);
      expect(res.fine).toMatchObject({
        reason: 'OVERDUE',
        amountCents: 125,
        status: 'OPEN',
        outstandingCents: 125,
      });

      await checkout(lidMember.memberNumber, 'C2');
      await prisma.loan.updateMany({
        where: { copy: { barcode: 'C2' } },
        data: { dueAt: new Date(Date.now() - 400 * DAY) },
      });
      expect((await checkin('C2')).json().fine.amountCents).toBe(1500);
    });

    it('verwerkt een beschadigd exemplaar', async () => {
      await addCopy('C1');
      await checkout(lidMember.memberNumber, 'C1');
      const res = (await checkin('C1', 'DAMAGED')).json();
      expect(res.fine).toMatchObject({ reason: 'DAMAGED', amountCents: 500 });
      expect(res.loan.outcome).toBe('DAMAGED');
      expect((await prisma.copy.findUniqueOrThrow({ where: { barcode: 'C1' } })).status).toBe(
        'DAMAGED',
      );
    });

    it('verwerkt een verloren exemplaar eenmalig', async () => {
      await addCopy('C1');
      const loan = (await checkout(lidMember.memberNumber, 'C1')).json();
      const res = await call('POST', `staff/loans/${loan.id}/lost`, staff);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        fine: { reason: 'LOST', amountCents: 2500 },
        loan: { outcome: 'LOST' },
      });
      expect((await prisma.copy.findUniqueOrThrow({ where: { barcode: 'C1' } })).status).toBe(
        'LOST',
      );
      expect((await call('POST', `staff/loans/${loan.id}/lost`, staff)).json().code).toBe(
        'LOAN_CLOSED',
      );
    });

    it('betaalt boetes (deels), voorkomt overbetaling en kwijtschelden werkt', async () => {
      const f1 = await prisma.fine.create({
        data: { memberId: lidMember.id, reason: 'OVERDUE', amountCents: 800 },
      });
      let res = await call('POST', `staff/fines/${f1.id}/pay`, staff, { amountCents: 300 });
      expect(res.json()).toMatchObject({ status: 'OPEN', paidCents: 300, outstandingCents: 500 });
      expect(
        (await call('POST', `staff/fines/${f1.id}/pay`, staff, { amountCents: 600 })).json().code,
      ).toBe('AMOUNT_TOO_HIGH');
      expect(
        (await call('POST', `staff/fines/${f1.id}/pay`, staff, { amountCents: -5 })).statusCode,
      ).toBe(400);
      res = await call('POST', `staff/fines/${f1.id}/pay`, staff, {
        amountCents: 500,
        method: 'CARD',
      });
      expect(res.json()).toMatchObject({ status: 'PAID', outstandingCents: 0 });
      expect(
        (await call('POST', `staff/fines/${f1.id}/pay`, staff, { amountCents: 1 })).json().code,
      ).toBe('FINE_PAID');

      const f2 = await prisma.fine.create({
        data: { memberId: lidMember.id, reason: 'LOST', amountCents: 2500 },
      });
      expect((await call('POST', `staff/fines/${f2.id}/waive`, staff)).json()).toMatchObject({
        status: 'WAIVED',
        outstandingCents: 0,
      });
      expect(
        (await call('POST', `staff/fines/${f2.id}/pay`, staff, { amountCents: 100 })).json().code,
      ).toBe('FINE_WAIVED');
      expect((await call('POST', 'staff/fines/99999/waive', staff)).statusCode).toBe(404);
    });

    it('betaalde of kwijtgescholden boetes blokkeren het uitlenen niet meer', async () => {
      await addCopy('C1');
      const f = await prisma.fine.create({
        data: { memberId: lidMember.id, reason: 'LOST', amountCents: 2500 },
      });
      expect((await checkout(lidMember.memberNumber, 'C1')).json().code).toBe('OUTSTANDING_FINES');
      await call('POST', `staff/fines/${f.id}/waive`, staff);
      expect((await checkout(lidMember.memberNumber, 'C1')).statusCode).toBe(201);
    });
  });

  describe('verlengen', () => {
    async function loanFor(barcode: string, memberNumber = lidMember.memberNumber) {
      await addCopy(barcode);
      return (await checkout(memberNumber, barcode)).json() as { id: number; dueAt: string };
    }

    it('verlengt de eigen uitleen, tot het maximum', async () => {
      const loan = await loanFor('C1');
      let res = await call('POST', `me/loans/${loan.id}/renew`, lid);
      expect(res.statusCode).toBe(200);
      expect(res.json().renewals).toBe(1);
      expect(
        (new Date(res.json().dueAt).getTime() - new Date(loan.dueAt).getTime()) / DAY,
      ).toBeCloseTo(21, 1);
      res = await call('POST', `me/loans/${loan.id}/renew`, lid);
      expect(res.json()).toMatchObject({ renewals: 2, canRenew: false });
      res = await call('POST', `me/loans/${loan.id}/renew`, lid);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('MAX_RENEWALS');
    });

    it('weigert verlengen bij te laat, reservering, blokkade of andermans uitleen', async () => {
      const loan = await loanFor('C1');
      const other = await addMember('ander@example.nl');
      const otherSession = await login(app, 'ander@example.nl');
      expect((await call('POST', `me/loans/${loan.id}/renew`, otherSession)).statusCode).toBe(404);
      void other;

      jest.spyOn(LoansService.prototype, 'hasWaitingReservation').mockResolvedValue(true);
      expect((await call('POST', `me/loans/${loan.id}/renew`, lid)).json().code).toBe('RESERVED');
      jest.restoreAllMocks();

      await prisma.member.update({ where: { id: lidMember.id }, data: { blocked: true } });
      expect((await call('POST', `me/loans/${loan.id}/renew`, lid)).json().code).toBe(
        'MEMBER_BLOCKED',
      );
      await prisma.member.update({ where: { id: lidMember.id }, data: { blocked: false } });

      await prisma.loan.update({
        where: { id: loan.id },
        data: { dueAt: new Date(Date.now() - DAY) },
      });
      expect((await call('POST', `me/loans/${loan.id}/renew`, lid)).json().code).toBe('OVERDUE');
      expect((await call('POST', 'me/loans/999999/renew', lid)).statusCode).toBe(404);
    });

    it('medewerkers kunnen een uitleen namens een lid verlengen', async () => {
      const loan = await loanFor('C1');
      expect((await call('POST', `staff/loans/${loan.id}/renew`, staff)).json().renewals).toBe(1);
    });
  });

  describe('ledenbeheer', () => {
    it('zoekt leden en toont detail met uitleningen en boetes', async () => {
      await addCopy('C1');
      await checkout(lidMember.memberNumber, 'C1');
      await prisma.fine.create({
        data: { memberId: lidMember.id, reason: 'OVERDUE', amountCents: 200 },
      });
      const found = (await call('GET', `staff/members?q=${lidMember.memberNumber}`, staff)).json();
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        activeLoans: 1,
        outstandingFinesCents: 200,
        membershipValid: true,
        blocked: false,
      });
      expect((await call('GET', 'staff/members?q=lid@', staff)).json()).toHaveLength(1);
      const detail = (await call('GET', `staff/members/${lidMember.id}`, staff)).json();
      expect(detail.loans).toHaveLength(1);
      expect(detail.fines).toHaveLength(1);
    });

    it('blokkeert, deblokkeert en verlengt het lidmaatschap', async () => {
      await addCopy('C1');
      let res = await call('PATCH', `staff/members/${lidMember.id}/block`, staff, {
        blocked: true,
        reason: 'Fraude',
      });
      expect(res.json()).toMatchObject({ blocked: true, blockedReason: 'Fraude' });
      expect((await checkout(lidMember.memberNumber, 'C1')).statusCode).toBe(403);
      res = await call('PATCH', `staff/members/${lidMember.id}/block`, staff, { blocked: false });
      expect(res.json()).toMatchObject({ blocked: false, blockedReason: null });

      await prisma.member.update({
        where: { id: lidMember.id },
        data: { membershipUntil: new Date(Date.now() - 10 * DAY) },
      });
      res = await call('POST', `staff/members/${lidMember.id}/extend`, staff, {});
      expect(res.json().membershipValid).toBe(true);
      const until = new Date(res.json().membershipUntil).getTime();
      expect((until - Date.now()) / DAY).toBeGreaterThan(360);
      expect((await call('POST', 'staff/members/99999/extend', staff, {})).statusCode).toBe(404);
    });

    it('leden zien hun eigen uitleningen en boetes', async () => {
      await addCopy('C1');
      await checkout(lidMember.memberNumber, 'C1');
      const res = (await call('GET', 'me/membership', lid)).json();
      expect(res).toMatchObject({ memberNumber: lidMember.memberNumber, activeLoans: 1 });
      expect(res.loans[0]).toMatchObject({ title: 'Het diner', canRenew: true });
      expect((await call('GET', 'me/membership')).statusCode).toBe(401);
    });

    it('toont actieve en te late uitleningen aan medewerkers', async () => {
      await addCopy('C1');
      await addCopy('C2');
      await checkout(lidMember.memberNumber, 'C1');
      await checkout(lidMember.memberNumber, 'C2');
      await prisma.loan.updateMany({
        where: { copy: { barcode: 'C2' } },
        data: { dueAt: new Date(Date.now() - DAY) },
      });
      expect((await call('GET', 'staff/loans?status=active', staff)).json()).toHaveLength(2);
      const overdue = (await call('GET', 'staff/loans?status=overdue', staff)).json();
      expect(overdue).toHaveLength(1);
      expect(overdue[0]).toMatchObject({ barcode: 'C2', overdue: true });
    });
  });

  describe('instellingen en etiketten', () => {
    it('alleen beheerders wijzigen instellingen; waarden worden gevalideerd en gebruikt', async () => {
      expect((await call('GET', 'staff/settings', staff)).json()).toMatchObject({
        loanDays: 21,
        maxLoansPerMember: 5,
      });
      expect((await call('PATCH', 'admin/settings', staff, { loanDays: 7 })).statusCode).toBe(403);
      expect((await call('PATCH', 'admin/settings', admin, { loanDays: 0 })).statusCode).toBe(400);
      expect((await call('PATCH', 'admin/settings', admin, { bestaatNiet: 1 })).statusCode).toBe(
        400,
      );
      expect(
        (await call('PATCH', 'admin/settings', admin, { loanDays: 7, finePerDayCents: 50 })).json(),
      ).toMatchObject({ loanDays: 7, finePerDayCents: 50 });
      await addCopy('C1');
      const loan = (await checkout(lidMember.memberNumber, 'C1')).json();
      expect(
        (new Date(loan.dueAt).getTime() - new Date(loan.loanedAt).getTime()) / DAY,
      ).toBeCloseTo(7, 1);
      await prisma.loan.update({
        where: { id: loan.id },
        data: { dueAt: new Date(Date.now() - 2 * DAY + 1000) },
      });
      expect((await checkin('C1')).json().fine.amountCents).toBe(100); // 2 dagen × 50
    });

    it('levert etikettendata per boek', async () => {
      await addCopy('C1');
      await addCopy('C2');
      const labels = (await call('GET', `staff/labels?bookId=${bookId}`, staff)).json();
      expect(labels).toEqual([
        { barcode: 'C1', title: 'Het diner', bookId },
        { barcode: 'C2', title: 'Het diner', bookId },
      ]);
    });
  });
});
