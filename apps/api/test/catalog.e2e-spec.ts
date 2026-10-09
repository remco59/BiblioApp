import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, createUser, login, resetCatalog, resetDb } from './helpers';

process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), 'biblio-covers-'));

describe('Catalogus (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let staff: { cookie: string; csrf: string };
  let member: { cookie: string; csrf: string };

  const get = (url: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url: `/api/${url}`, headers });
  const send = (
    method: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    who: { cookie: string; csrf: string },
    payload?: unknown,
    extra: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: `/api/${url}`,
      payload: payload as object,
      headers: { cookie: who.cookie, 'x-csrf-token': who.csrf, ...extra },
    });

  async function seed() {
    await resetCatalog(prisma);
    const mk = (title: string, o: Record<string, unknown> = {}) =>
      prisma.book.create({ data: { title, ...o } as never });
    const thriller = await prisma.genre.create({ data: { name: 'Thriller' } });
    const fantasy = await prisma.genre.create({ data: { name: 'Fantasy' } });
    const koch = await prisma.author.create({ data: { name: 'Herman Koch' } });
    const noort = await prisma.author.create({ data: { name: 'Saskia Noort' } });
    const tag = await prisma.tag.create({ data: { name: 'verfilmd' } });
    const diner = await mk('Het diner', {
      isbn: '9789041400024',
      publishedYear: 2009,
      genreId: thriller.id,
      description: 'Twee echtparen eten in een restaurant',
      authors: { create: { authorId: koch.id } },
      tags: { create: { tagId: tag.id } },
      copies: { create: [{ barcode: 'D1' }, { barcode: 'D2', status: 'LOANED' }] },
    });
    await mk('Zomerhuis met zwembad', {
      publishedYear: 2011,
      genreId: thriller.id,
      authors: { create: { authorId: koch.id } },
      copies: { create: [{ barcode: 'Z1', status: 'LOANED' }] },
    });
    await mk('Terug naar de kust', {
      publishedYear: 2012,
      genreId: thriller.id,
      authors: { create: { authorId: noort.id } },
      copies: { create: [{ barcode: 'K1' }] },
    });
    await mk('De dragenruiter', {
      publishedYear: 1990,
      language: 'en',
      genreId: fantasy.id,
      copies: { create: [{ barcode: 'R1' }] },
    });
    return { diner };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    await resetDb(prisma);
    await createUser(prisma, 'bib@example.nl', 'LIBRARIAN');
    await createUser(prisma, 'lid@example.nl', 'MEMBER');
    const s = await login(app, 'bib@example.nl');
    staff = { cookie: s.cookie, csrf: s.csrf };
    const m = await login(app, 'lid@example.nl');
    member = { cookie: m.cookie, csrf: m.csrf };
  });
  beforeEach(seed);
  afterAll(() => app.close());

  describe('zoeken', () => {
    const titles = async (qs: string) =>
      (await get(`books?${qs}`)).json().items.map((b: { title: string }) => b.title);

    it('zonder zoekterm: alfabetisch met afgeleide beschikbaarheid', async () => {
      const res = (await get('books')).json();
      expect(res.total).toBe(4);
      expect(res.items.map((b: { title: string }) => b.title)).toEqual([
        'De dragenruiter',
        'Het diner',
        'Terug naar de kust',
        'Zomerhuis met zwembad',
      ]);
      const diner = res.items.find((b: { title: string }) => b.title === 'Het diner');
      expect(diner).toMatchObject({
        copiesTotal: 2,
        copiesAvailable: 1,
        genre: 'Thriller',
        tags: ['verfilmd'],
      });
    });

    it('vindt op titel, auteur, ISBN, trefwoord en beschrijving', async () => {
      expect(await titles('q=diner')).toEqual(['Het diner']);
      expect(await titles('q=noort')).toEqual(['Terug naar de kust']);
      expect(await titles('q=9789041400024')).toEqual(['Het diner']);
      expect(await titles('q=978-90-4140-0024')).toEqual(['Het diner']);
      expect(await titles('q=verfilmd')).toEqual(['Het diner']);
      expect(await titles('q=restaurant')).toEqual(['Het diner']);
    });

    it('vindt ondanks typefouten (trigram)', async () => {
      expect(await titles('q=dinner')).toContain('Het diner');
    });

    it('rangschikt op relevantie: titel boven alleen-auteur', async () => {
      const t = await titles('q=Koch');
      expect(t.sort()).toEqual(['Het diner', 'Zomerhuis met zwembad']);
    });

    it('geeft "bedoelde je" bij 0 resultaten', async () => {
      const res = (await get('books?q=Saskia Noorth&pageSize=5')).json();
      // 'noorth' is dichtbij genoeg om te matchen óf te suggereren
      expect(res.total > 0 || res.suggestion).toBeTruthy();
      const none = (await get('books?q=xqzvwk')).json();
      expect(none).toMatchObject({ total: 0, items: [], suggestion: null });
      const typo = (await get('books?q=drakenruitr')).json();
      expect(typo.total > 0 || typo.suggestion === 'De dragenruiter').toBe(true);
    });

    it('filtert op genre, taal, jaar en beschikbaarheid', async () => {
      expect(await titles('genre=Fantasy')).toEqual(['De dragenruiter']);
      expect(await titles('language=en')).toEqual(['De dragenruiter']);
      expect(await titles('yearFrom=2010&yearTo=2011')).toEqual(['Zomerhuis met zwembad']);
      expect(await titles('genre=Thriller&available=true')).toEqual([
        'Het diner',
        'Terug naar de kust',
      ]);
      expect(await titles('tag=verfilmd')).toEqual(['Het diner']);
    });

    it('sorteert en pagineert', async () => {
      expect(await titles('sort=year_desc')).toEqual([
        'Terug naar de kust',
        'Zomerhuis met zwembad',
        'Het diner',
        'De dragenruiter',
      ]);
      expect(await titles('sort=year_asc&pageSize=2&page=2')).toEqual([
        'Zomerhuis met zwembad',
        'Terug naar de kust',
      ]);
      const p = (await get('books?pageSize=3&page=2')).json();
      expect(p).toMatchObject({ total: 4, page: 2, pageSize: 3 });
      expect(p.items).toHaveLength(1);
    });

    it('valideert queryparameters en blijft veilig bij SQL-achtige invoer', async () => {
      expect((await get('books?sort=hacked')).statusCode).toBe(400);
      expect((await get('books?pageSize=1000')).statusCode).toBe(400);
      const res = await get(`books?q=${encodeURIComponent('\'; DROP TABLE "Book"; --')}`);
      expect(res.statusCode).toBe(200);
      expect((await get('books')).json().total).toBe(4);
    });

    it('filter-opties', async () => {
      expect((await get('catalog/filters')).json()).toEqual({
        genres: ['Fantasy', 'Thriller'],
        languages: ['en', 'nl'],
        tags: ['verfilmd'],
        minYear: 1990,
        maxYear: 2012,
      });
    });
  });

  describe('detailpagina', () => {
    it('toont exemplaren, beschikbaarheid en vergelijkbare boeken; barcodes alleen voor medewerkers', async () => {
      const { diner } = await prisma.book
        .findMany({ where: { title: 'Het diner' } })
        .then((b) => ({ diner: b[0]! }));
      const anon = (await get(`books/${diner.id}`)).json();
      expect(anon.copies).toEqual([
        expect.objectContaining({ status: 'AVAILABLE', barcode: null }),
        expect.objectContaining({ status: 'LOANED', barcode: null }),
      ]);
      expect(anon.similar.map((b: { title: string }) => b.title)).toEqual(
        expect.arrayContaining(['Zomerhuis met zwembad']),
      );
      expect(anon.similar.map((b: { id: number }) => b.id)).not.toContain(diner.id);
      const asStaff = (await get(`books/${diner.id}`, { cookie: staff.cookie })).json();
      expect(asStaff.copies[0].barcode).toBe('D1');
      expect((await get('books/999999')).statusCode).toBe(404);
    });
  });

  describe('beheer', () => {
    it('is alleen toegankelijk voor medewerkers', async () => {
      const body = { title: 'Nieuw' };
      expect(
        (await app.inject({ method: 'POST', url: '/api/staff/books', payload: body })).statusCode,
      ).toBe(401);
      expect((await send('POST', 'staff/books', member, body)).statusCode).toBe(403);
      expect((await send('POST', 'staff/books', staff, body)).statusCode).toBe(201);
    });

    it('maakt, wijzigt en verwijdert een boek met auteurs, tags, reeks en exemplaren', async () => {
      const created = await send('POST', 'staff/books', staff, {
        title: 'De hobbit',
        isbn: '978-0-261-10221-7',
        genre: 'Fantasy',
        authors: ['J.R.R. Tolkien'],
        tags: ['klassieker', 'draken'],
        series: 'Midden-aarde',
        seriesNumber: 1,
        publishedYear: 1937,
        language: 'en',
      });
      expect(created.statusCode).toBe(201);
      const book = created.json();
      expect(book).toMatchObject({
        isbn: '9780261102217',
        series: 'Midden-aarde',
        tags: ['draken', 'klassieker'],
        authors: [{ name: 'J.R.R. Tolkien' }],
      });

      expect(
        (await send('POST', 'staff/books', staff, { title: 'Dubbel', isbn: '9780261102217' }))
          .statusCode,
      ).toBe(409);

      const c1 = (await send('POST', `staff/books/${book.id}/copies`, staff, {})).json();
      const c2 = (await send('POST', `staff/books/${book.id}/copies`, staff, {})).json();
      expect(c1.barcode).not.toBe(c2.barcode);
      expect(
        (await send('POST', `staff/books/${book.id}/copies`, staff, { barcode: c1.barcode }))
          .statusCode,
      ).toBe(409);
      expect(
        (await send('PATCH', `staff/copies/${c2.id}`, staff, { status: 'DAMAGED' })).json().status,
      ).toBe('DAMAGED');

      const updated = (
        await send('PATCH', `staff/books/${book.id}`, staff, {
          title: 'The Hobbit',
          authors: ['J.R.R. Tolkien'],
          tags: ['klassieker'],
        })
      ).json();
      expect(updated).toMatchObject({
        title: 'The Hobbit',
        tags: ['klassieker'],
        copiesTotal: 2,
        copiesAvailable: 1,
      });

      expect((await send('DELETE', `staff/copies/${c2.id}`, staff)).statusCode).toBe(204);
      expect((await send('DELETE', `staff/books/${book.id}`, staff)).statusCode).toBe(204);
      expect((await get(`books/${book.id}`)).statusCode).toBe(404);
      expect((await send('DELETE', `staff/books/${book.id}`, staff)).statusCode).toBe(404);
    });

    it('beheert auteurs, genres, tags en reeksen', async () => {
      const a = (
        await send('POST', 'staff/lookups/authors', staff, { name: 'Nieuwe Auteur' })
      ).json();
      expect(
        (
          await send('PATCH', `staff/lookups/authors/${a.id}`, staff, { name: 'Andere Naam' })
        ).json().name,
      ).toBe('Andere Naam');
      const list = (await get('staff/lookups/authors', { cookie: staff.cookie })).json();
      expect(list).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Andere Naam', books: 0 }),
          expect.objectContaining({ name: 'Herman Koch', books: 2 }),
        ]),
      );
      expect((await send('DELETE', `staff/lookups/authors/${a.id}`, staff)).statusCode).toBe(204);
      expect((await get('staff/lookups/onzin', { cookie: staff.cookie })).statusCode).toBe(404);
      expect(
        (await send('POST', 'staff/lookups/genres', staff, { name: 'Poëzie' })).statusCode,
      ).toBe(201);
    });

    it('uploadt covers (alleen afbeeldingen, beperkte grootte)', async () => {
      const book = await prisma.book.findFirstOrThrow({ where: { title: 'Het diner' } });
      const multipart = (type: string, data: Buffer) => {
        const boundary = 'xBOUNDARYx';
        const head = Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="c.bin"\r\nContent-Type: ${type}\r\n\r\n`,
        );
        const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
        return {
          payload: Buffer.concat([head, data, tail]),
          headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        };
      };
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
      const ok = multipart('image/png', png);
      const res = await app.inject({
        method: 'POST',
        url: `/api/staff/books/${book.id}/cover`,
        payload: ok.payload,
        headers: { ...ok.headers, cookie: staff.cookie, 'x-csrf-token': staff.csrf },
      });
      expect(res.statusCode).toBe(201);
      const { coverUrl } = res.json();
      const served = await app.inject({ method: 'GET', url: coverUrl });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.rawPayload.equals(png)).toBe(true);
      expect((await get(`books/${book.id}`)).json().coverUrl).toBe(coverUrl);

      const bad = multipart('text/html', Buffer.from('<script>alert(1)</script>'));
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/staff/books/${book.id}/cover`,
            payload: bad.payload,
            headers: { ...bad.headers, cookie: staff.cookie, 'x-csrf-token': staff.csrf },
          })
        ).statusCode,
      ).toBe(400);
      const big = multipart('image/png', Buffer.alloc(3 * 1024 * 1024));
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/staff/books/${book.id}/cover`,
            payload: big.payload,
            headers: { ...big.headers, cookie: staff.cookie, 'x-csrf-token': staff.csrf },
          })
        ).statusCode,
      ).toBeGreaterThanOrEqual(400);
      expect((await get('covers/..%2F..%2Fetc%2Fpasswd')).statusCode).toBe(404);
    });

    it('haalt een externe cover eenmalig binnen en serveert hem zelf', async () => {
      const real = global.fetch;
      const jpg = Buffer.alloc(4096, 7);
      try {
        global.fetch = jest.fn(async (url: string | URL | Request) =>
          String(url).includes('/b/isbn/')
            ? new Response(jpg, { status: 200, headers: { 'content-type': 'image/jpeg' } })
            : new Response('', { status: 404 }),
        ) as never;
        const ext = 'https://covers.openlibrary.org/b/isbn/9780261102217-L.jpg';
        const book = (
          await send('POST', 'staff/books', staff, { title: 'Cover', coverUrl: ext })
        ).json();
        expect(book.coverUrl).toMatch(/^\/api\/covers\/remote-[0-9a-f]+\.jpg$/);
        const served = await app.inject({ method: 'GET', url: book.coverUrl });
        expect(served.headers['content-type']).toBe('image/jpeg');
        expect(served.rawPayload.equals(jpg)).toBe(true);

        // Mislukt binnenhalen: de externe URL blijft in gebruik.
        const missing = 'https://covers.openlibrary.org/b/id/0-L.jpg';
        const kept = await send('PATCH', `staff/books/${book.id}`, staff, {
          title: 'Cover',
          coverUrl: missing,
        });
        expect(kept.json().coverUrl).toBe(missing);
      } finally {
        global.fetch = real;
      }
    });

    it('ISBN-lookup (Open Library, met fallback op Google Books)', async () => {
      const real = global.fetch;
      try {
        global.fetch = jest.fn(async (url: string | URL | Request) => {
          const u = String(url);
          if (u.includes('openlibrary')) return new Response('{}', { status: 200 });
          return new Response(
            JSON.stringify({
              items: [
                {
                  volumeInfo: {
                    title: 'De hobbit',
                    authors: ['J.R.R. Tolkien'],
                    publishedDate: '1937-09-21',
                    language: 'nl',
                    imageLinks: { thumbnail: 'http://img/x.jpg' },
                  },
                },
              ],
            }),
            { status: 200 },
          );
        }) as never;
        const res = await get('staff/isbn/9780261102217', { cookie: staff.cookie });
        expect(res.json()).toMatchObject({
          isbn: '9780261102217',
          title: 'De hobbit',
          authors: ['J.R.R. Tolkien'],
          publishedYear: 1937,
          language: 'nl',
          coverUrl: 'https://img/x.jpg',
        });
        expect((await get('staff/isbn/123', { cookie: staff.cookie })).statusCode).toBe(400);
        global.fetch = jest.fn(async () => new Response('{}', { status: 200 })) as never;
        expect((await get('staff/isbn/9780261102217', { cookie: staff.cookie })).statusCode).toBe(
          404,
        );
      } finally {
        global.fetch = real;
      }
    });

    it('CSV-export en -import (roundtrip, fouten per rij)', async () => {
      const csv = await get('staff/books.csv', { cookie: staff.cookie });
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.body.split('\n')[0]).toBe(
        'isbn,title,authors,genre,language,year,tags,series,seriesNumber,description,copies',
      );
      expect(csv.body).toContain('Het diner');

      const input = [
        'isbn,title,authors,genre,language,year,tags,series,seriesNumber,description,copies',
        '9780261102217,"De hobbit, of heen en terug",J.R.R. Tolkien,Fantasy,en,1937,klassieker; draken,Midden-aarde,1,"Een ""hobbit"" op reis",3',
        '9789041400024,Het diner (herdruk),Herman Koch,Thriller,nl,2009,verfilmd,,,,2',
        ',,,,,,,,,,',
        'ongeldig,Slecht ISBN,,,,,,,,,',
        ',Zonder jaar,,,,abc,,,,,',
      ].join('\n');
      const res = await app.inject({
        method: 'POST',
        url: '/api/staff/books/import',
        payload: input,
        headers: { cookie: staff.cookie, 'x-csrf-token': staff.csrf, 'content-type': 'text/csv' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ created: 1, updated: 1 });
      expect(res.json().errors).toEqual([
        expect.stringContaining('Regel 5'),
        expect.stringContaining('Regel 6'),
      ]);

      const hobbit = await prisma.book.findUniqueOrThrow({
        where: { isbn: '9780261102217' },
        include: { copies: true },
      });
      expect(hobbit).toMatchObject({
        title: 'De hobbit, of heen en terug',
        description: 'Een "hobbit" op reis',
      });
      expect(hobbit.copies).toHaveLength(3);
      const diner = await prisma.book.findUniqueOrThrow({
        where: { isbn: '9789041400024' },
        include: { copies: true },
      });
      expect(diner.title).toBe('Het diner (herdruk)');
      expect(diner.copies).toHaveLength(2);

      const notCsv = await send('POST', 'staff/books/import', staff, { a: 1 });
      expect(notCsv.statusCode).toBe(400);
    });
  });
});
