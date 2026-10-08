import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, createUser, login, MailStub, resetCatalog, resetDb } from './helpers';

process.env.AUTH_RATE_LIMIT_MAX = '1000';

type Who = { cookie: string; csrf: string };
const DAY = 86400000;

describe('Community (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let mail: MailStub;
  let staff: Who;
  const users: Record<
    string,
    { who: Who; userId: number; memberId: number; memberNumber: string }
  > = {};
  let diner: number;
  let hobbit: number;
  let thriller2: number;

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
  const as = (n: string) => users[n]!.who;
  const notifications = (n: string) =>
    prisma.notification.findMany({ where: { userId: users[n]!.userId }, orderBy: { id: 'asc' } });

  async function addUser(name: string, locale = 'nl') {
    const email = `${name}@example.nl`;
    const u = await createUser(prisma, email, 'MEMBER');
    if (locale !== 'nl') await prisma.user.update({ where: { id: u.id }, data: { locale } });
    const m = await prisma.member.findUniqueOrThrow({ where: { userId: u.id } });
    users[name] = {
      who: await login(app, email),
      userId: u.id,
      memberId: m.id,
      memberNumber: m.memberNumber,
    };
  }
  /** Maakt een afgesloten uitleen: het lid heeft het boek geleend. */
  async function borrowed(name: string, bookId: number, returned = true) {
    const copy =
      (await prisma.copy.findFirst({ where: { bookId } })) ??
      (await prisma.copy.create({ data: { bookId, barcode: `X${bookId}-${Math.random()}` } }));
    return prisma.loan.create({
      data: {
        copyId: copy.id,
        memberId: users[name]!.memberId,
        dueAt: new Date(Date.now() + 14 * DAY),
        returnedAt: returned ? new Date() : null,
        outcome: returned ? 'RETURNED' : null,
      },
    });
  }

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
    await prisma.review.deleteMany();
    await prisma.wishlistItem.deleteMany();
    await prisma.suggestion.deleteMany();
    await prisma.emailTemplate.deleteMany();
    await prisma.setting.deleteMany();
    await resetCatalog(prisma);
    await resetDb(prisma);
    mail.sent.length = 0;
    await createUser(prisma, 'bib@example.nl', 'LIBRARIAN');
    staff = await login(app, 'bib@example.nl');
    for (const n of ['anna', 'bram', 'carla']) await addUser(n);

    const thriller = await prisma.genre.create({ data: { name: 'Thriller' } });
    const fantasy = await prisma.genre.create({ data: { name: 'Fantasy' } });
    const koch = await prisma.author.create({ data: { name: 'Herman Koch' } });
    const tolkien = await prisma.author.create({ data: { name: 'Tolkien' } });
    const tag = await prisma.tag.create({ data: { name: 'verfilmd' } });
    diner = (
      await prisma.book.create({
        data: {
          title: 'Het diner',
          genreId: thriller.id,
          authors: { create: { authorId: koch.id } },
          tags: { create: { tagId: tag.id } },
          copies: { create: [{ barcode: 'D1' }] },
        },
      })
    ).id;
    thriller2 = (
      await prisma.book.create({
        data: {
          title: 'Zomerhuis',
          genreId: thriller.id,
          authors: { create: { authorId: koch.id } },
          copies: { create: [{ barcode: 'Z1' }] },
        },
      })
    ).id;
    await prisma.book.create({
      data: {
        title: 'Een andere thriller',
        genreId: thriller.id,
        copies: { create: [{ barcode: 'T1' }] },
      },
    });
    hobbit = (
      await prisma.book.create({
        data: {
          title: 'De hobbit',
          genreId: fantasy.id,
          authors: { create: { authorId: tolkien.id } },
          copies: { create: [{ barcode: 'H1' }] },
        },
      })
    ).id;
  });
  afterAll(() => app.close());

  describe('reviews en sterren', () => {
    it('alleen wie het boek heeft geleend mag beoordelen; validatie van de score', async () => {
      expect(
        (await call('POST', 'me/reviews', as('anna'), { bookId: diner, rating: 5 })).json().code,
      ).toBe('NOT_BORROWED');
      await borrowed('anna', diner);
      expect(
        (await call('POST', 'me/reviews', as('anna'), { bookId: diner, rating: 6 })).statusCode,
      ).toBe(400);
      expect(
        (await call('POST', 'me/reviews', as('anna'), { bookId: diner, rating: 0 })).statusCode,
      ).toBe(400);
      expect(
        (await call('POST', 'me/reviews', as('anna'), { bookId: diner, rating: 4.5 })).statusCode,
      ).toBe(400);
      expect(
        (await call('POST', 'me/reviews', as('anna'), { bookId: 99999, rating: 5 })).statusCode,
      ).toBe(404);
      expect(
        (await call('POST', 'me/reviews', undefined, { bookId: diner, rating: 5 })).statusCode,
      ).toBe(401);
      const ok = await call('POST', 'me/reviews', as('anna'), {
        bookId: diner,
        rating: 5,
        body: '  Prachtig!  ',
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json()).toMatchObject({
        rating: 5,
        body: 'Prachtig!',
        status: 'PENDING',
        author: 'anna',
      });
    });

    it('toont reviews pas na goedkeuring en berekent gemiddelde en verdeling', async () => {
      for (const n of ['anna', 'bram', 'carla']) await borrowed(n, diner);
      const r1 = (
        await call('POST', 'me/reviews', as('anna'), { bookId: diner, rating: 5, body: 'Top' })
      ).json();
      const r2 = (
        await call('POST', 'me/reviews', as('bram'), { bookId: diner, rating: 2, body: 'Matig' })
      ).json();
      await call('POST', 'me/reviews', as('carla'), { bookId: diner, rating: 1, body: 'Slecht' });

      let pub = (await call('GET', `books/${diner}/reviews`)).json();
      expect(pub).toMatchObject({
        summary: { average: null, count: 0 },
        items: [],
        mine: null,
        canReview: false,
      });
      expect((await call('GET', `books/${diner}/reviews`, as('anna'))).json()).toMatchObject({
        mine: { status: 'PENDING' },
        canReview: true,
      });

      expect(
        (await call('POST', `staff/reviews/${r1.id}/moderate`, as('anna'), { status: 'APPROVED' }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await call('POST', `staff/reviews/${r1.id}/moderate`, staff, { status: 'APPROVED' })
        ).json().status,
      ).toBe('APPROVED');
      await call('POST', `staff/reviews/${r2.id}/moderate`, staff, { status: 'APPROVED' });

      pub = (await call('GET', `books/${diner}/reviews`)).json();
      expect(pub.summary).toEqual({ average: 3.5, count: 2, distribution: [0, 1, 0, 0, 1] });
      expect(pub.items.map((i: { body: string }) => i.body).sort()).toEqual(['Matig', 'Top']);
      const book = (await call('GET', `books/${diner}`)).json();
      expect(book).toMatchObject({ ratingAverage: 3.5, ratingCount: 2 });
      expect(
        (await call('GET', 'books')).json().items.find((b: { id: number }) => b.id === diner),
      ).toMatchObject({ ratingAverage: 3.5 });
    });

    it('wijzigen zet de review terug in moderatie; afwijzen met reden stuurt een melding', async () => {
      await borrowed('anna', diner);
      const r = (await call('POST', 'me/reviews', as('anna'), { bookId: diner, rating: 5 })).json();
      await call('POST', `staff/reviews/${r.id}/moderate`, staff, { status: 'APPROVED' });
      expect((await call('GET', `books/${diner}/reviews`)).json().summary.count).toBe(1);

      const edited = (
        await call('POST', 'me/reviews', as('anna'), {
          bookId: diner,
          rating: 1,
          body: 'Scheldwoorden',
        })
      ).json();
      expect(edited).toMatchObject({ id: r.id, status: 'PENDING', rating: 1 }); // zelfde review, geen tweede
      expect((await call('GET', `books/${diner}/reviews`)).json().summary.count).toBe(0);
      expect(await prisma.review.count()).toBe(1);

      const rejected = await call('POST', `staff/reviews/${r.id}/moderate`, staff, {
        status: 'REJECTED',
        note: 'Geen scheldwoorden a.u.b.',
      });
      expect(rejected.json()).toMatchObject({
        status: 'REJECTED',
        moderationNote: 'Geen scheldwoorden a.u.b.',
      });
      const [, n] = await notifications('anna');
      expect(n).toMatchObject({ type: 'REVIEW_MODERATED' });
      expect(n!.body).toContain('afgewezen');
      expect(n!.body).toContain('Geen scheldwoorden a.u.b.');
      expect((await call('GET', 'staff/reviews?status=REJECTED', staff)).json()).toHaveLength(1);
      expect((await call('GET', 'staff/reviews', staff)).json()).toHaveLength(0);
    });

    it('verwijdert een eigen review', async () => {
      await borrowed('anna', diner);
      await call('POST', 'me/reviews', as('anna'), { bookId: diner, rating: 3 });
      expect((await call('DELETE', `me/reviews/${diner}`, as('bram'))).statusCode).toBe(404);
      expect((await call('DELETE', `me/reviews/${diner}`, as('anna'))).statusCode).toBe(204);
      expect(await prisma.review.count()).toBe(0);
    });
  });

  describe('verlanglijst', () => {
    it('voegt toe, toont en verwijdert (idempotent)', async () => {
      expect((await call('POST', 'me/wishlist', as('anna'), { bookId: hobbit })).statusCode).toBe(
        204,
      );
      expect((await call('POST', 'me/wishlist', as('anna'), { bookId: hobbit })).statusCode).toBe(
        204,
      );
      expect((await call('POST', 'me/wishlist', as('anna'), { bookId: 99999 })).statusCode).toBe(
        404,
      );
      expect(
        (await call('GET', 'me/wishlist', as('anna')))
          .json()
          .map((b: { title: string }) => b.title),
      ).toEqual(['De hobbit']);
      expect((await call('GET', 'me/wishlist/ids', as('anna'))).json()).toEqual([hobbit]);
      expect((await call('GET', 'me/wishlist', as('bram'))).json()).toEqual([]);
      expect((await call('DELETE', `me/wishlist/${hobbit}`, as('anna'))).statusCode).toBe(204);
      expect((await call('GET', 'me/wishlist', as('anna'))).json()).toEqual([]);
    });

    it('meldt als een verlangd boek beschikbaar komt; niet dubbel, niet aan de lener', async () => {
      await prisma.copy.updateMany({ where: { bookId: hobbit }, data: { status: 'LOANED' } });
      await prisma.loan.create({
        data: {
          copyId: (await prisma.copy.findFirstOrThrow({ where: { bookId: hobbit } })).id,
          memberId: users.carla!.memberId,
          dueAt: new Date(Date.now() + DAY),
        },
      });
      await call('POST', 'me/wishlist', as('anna'), { bookId: hobbit });
      await call('POST', 'me/wishlist', as('carla'), { bookId: hobbit });
      expect(await notifications('anna')).toHaveLength(0);

      const res = await call('POST', 'staff/loans/checkin', staff, { barcode: 'H1' });
      expect(res.statusCode).toBe(200);
      const n = await notifications('anna');
      expect(n.map((x) => x.type)).toEqual(['WISHLIST_AVAILABLE']);
      expect(n[0]!.body).toContain('De hobbit');
      expect(mail.last('anna@example.nl')?.subject).toBe(
        'Een boek van je verlanglijst is beschikbaar',
      );
      expect(await notifications('carla')).toHaveLength(0); // wil het boek ook, maar had het net in handen

      // opnieuw beschikbaar zonder dat Anna de eerste las: geen tweede melding
      await prisma.copy.update({ where: { barcode: 'H1' }, data: { status: 'LOANED' } });
      await prisma.loan.create({
        data: {
          copyId: (await prisma.copy.findUniqueOrThrow({ where: { barcode: 'H1' } })).id,
          memberId: users.bram!.memberId,
          dueAt: new Date(Date.now() + DAY),
        },
      });
      await call('POST', 'staff/loans/checkin', staff, { barcode: 'H1' });
      expect(
        (await notifications('anna')).filter((x) => x.type === 'WISHLIST_AVAILABLE'),
      ).toHaveLength(1);
    });

    it('meldt niet als het exemplaar voor een reservering wordt klaargelegd', async () => {
      await prisma.copy.update({ where: { barcode: 'H1' }, data: { status: 'LOANED' } });
      await prisma.loan.create({
        data: {
          copyId: (await prisma.copy.findUniqueOrThrow({ where: { barcode: 'H1' } })).id,
          memberId: users.carla!.memberId,
          dueAt: new Date(Date.now() + DAY),
        },
      });
      await call('POST', 'me/wishlist', as('anna'), { bookId: hobbit });
      expect(
        (await call('POST', 'me/reservations', as('bram'), { bookId: hobbit })).statusCode,
      ).toBe(201);
      await call('POST', 'staff/loans/checkin', staff, { barcode: 'H1' });
      expect((await prisma.copy.findUniqueOrThrow({ where: { barcode: 'H1' } })).status).toBe(
        'RESERVED_HOLD',
      );
      expect(
        (await notifications('anna')).filter((x) => x.type === 'WISHLIST_AVAILABLE'),
      ).toHaveLength(0);
    });
  });

  describe('aankoopsuggesties', () => {
    it('dient in, weigert dubbelen en past een limiet toe', async () => {
      const ok = await call('POST', 'me/suggestions', as('anna'), {
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '978-0-441-17271-9',
        reason: 'Klassieker',
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json()).toMatchObject({
        title: 'Dune',
        status: 'SUBMITTED',
        isbn: '9780441172719',
        memberName: 'anna',
      });
      expect(
        (
          await call('POST', 'me/suggestions', as('anna'), {
            title: 'dune',
            author: 'FRANK HERBERT',
          })
        ).json().code,
      ).toBe('SUGGESTION_DUPLICATE');
      expect(
        (await call('POST', 'me/suggestions', as('anna'), { title: '', author: 'x' })).statusCode,
      ).toBe(400);
      for (let i = 0; i < 9; i++)
        await call('POST', 'me/suggestions', as('anna'), { title: `Boek ${i}`, author: 'A' });
      expect(
        (
          await call('POST', 'me/suggestions', as('anna'), { title: 'Een te veel', author: 'A' })
        ).json().code,
      ).toBe('SUGGESTION_LIMIT');
      expect((await call('GET', 'me/suggestions', as('anna'))).json()).toHaveLength(10);
      expect((await call('GET', 'me/suggestions', as('bram'))).json()).toHaveLength(0);
    });

    it('medewerkers handelen af; het lid krijgt een melding in de eigen taal, alleen bij een statuswijziging', async () => {
      await addUser('emma', 'en');
      const s = (
        await call('POST', 'me/suggestions', as('emma'), { title: 'Dune', author: 'Frank Herbert' })
      ).json();
      expect(
        (await call('PATCH', `staff/suggestions/${s.id}`, as('emma'), { status: 'APPROVED' }))
          .statusCode,
      ).toBe(403);
      expect(
        (await call('PATCH', `staff/suggestions/${s.id}`, staff, { status: 'bestaatniet' }))
          .statusCode,
      ).toBe(400);
      const res = await call('PATCH', `staff/suggestions/${s.id}`, staff, {
        status: 'ORDERED',
        note: 'Arrives in November.',
      });
      expect(res.json()).toMatchObject({ status: 'ORDERED', staffNote: 'Arrives in November.' });
      const [n] = await notifications('emma');
      expect(n).toMatchObject({
        type: 'SUGGESTION_UPDATED',
        title: 'Update on your purchase suggestion',
      });
      expect(n!.body).toBe(
        'Your suggestion “Dune” now has the status: ordered. Arrives in November.',
      );
      await call('PATCH', `staff/suggestions/${s.id}`, staff, {
        status: 'ORDERED',
        note: 'Nog steeds besteld',
      });
      expect(await notifications('emma')).toHaveLength(1);
      expect((await call('GET', 'staff/suggestions?status=ORDERED', staff)).json()).toHaveLength(1);
      expect((await call('GET', 'staff/suggestions?status=SUBMITTED', staff)).json()).toHaveLength(
        0,
      );
      expect(
        (await call('PATCH', 'staff/suggestions/99999', staff, { status: 'ADDED' })).statusCode,
      ).toBe(404);
    });
  });

  describe('aanbevelingen', () => {
    it('vergelijkbare boeken: zelfde auteur boven alleen zelfde genre', async () => {
      const similar = (await call('GET', `books/${diner}`))
        .json()
        .similar.map((b: { title: string }) => b.title);
      expect(similar).toEqual(['Zomerhuis', 'Een andere thriller']); // auteur+genre+... eerst, dan alleen genre
      expect(similar).not.toContain('De hobbit');
    });

    it('persoonlijke aanbevelingen volgen de leesgeschiedenis en slaan gelezen boeken over', async () => {
      await borrowed('anna', diner);
      const recs = (await call('GET', 'me/recommendations', as('anna')))
        .json()
        .map((b: { title: string }) => b.title);
      expect(recs[0]).toBe('Zomerhuis'); // zelfde auteur + genre + (geen tag) → hoogste score
      expect(recs).toContain('Een andere thriller');
      expect(recs).not.toContain('Het diner'); // al geleend
      expect(recs).not.toContain('De hobbit'); // geen overlap
    });

    it('verlanglijst telt mee; zonder geschiedenis krijg je de best beoordeelde boeken', async () => {
      await call('POST', 'me/wishlist', as('bram'), { bookId: hobbit });
      expect(
        (await call('GET', 'me/recommendations', as('bram')))
          .json()
          .map((b: { title: string }) => b.title),
      ).not.toContain('De hobbit');

      // carla heeft niets: nieuwste/best beoordeelde eerst
      await borrowed('anna', thriller2);
      const r = (
        await call('POST', 'me/reviews', as('anna'), { bookId: thriller2, rating: 5 })
      ).json();
      await call('POST', `staff/reviews/${r.id}/moderate`, staff, { status: 'APPROVED' });
      const recs = (await call('GET', 'me/recommendations', as('carla'))).json();
      expect(recs[0].title).toBe('Zomerhuis');
      expect((await call('GET', 'me/recommendations')).statusCode).toBe(401);
    });
  });
});
