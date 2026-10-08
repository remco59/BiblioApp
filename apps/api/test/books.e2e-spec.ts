import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { setup } from '../src/setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('API (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await setup(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await prisma.copy.deleteMany();
    await prisma.bookAuthor.deleteMany();
    await prisma.book.deleteMany();
    await prisma.author.deleteMany();
    await prisma.genre.deleteMany();
    const genre = await prisma.genre.create({ data: { name: 'Thriller' } });
    await prisma.book.create({
      data: {
        title: 'Testboek',
        isbn: '9780000000002',
        genreId: genre.id,
        authors: { create: { author: { create: { name: 'Test Auteur' } } } },
        copies: {
          create: [
            { barcode: 'T1', status: 'AVAILABLE' },
            { barcode: 'T2', status: 'LOANED' },
          ],
        },
      },
    });
  });

  afterAll(() => app.close());

  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: true });
  });

  it('GET /api/books geeft afgeleide beschikbaarheid', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/books' });
    expect(res.statusCode).toBe(200);
    const [book] = res.json();
    expect(book).toMatchObject({
      title: 'Testboek',
      genre: 'Thriller',
      authors: [{ name: 'Test Auteur' }],
      copiesTotal: 2,
      copiesAvailable: 1,
    });
  });

  it('GET /api/books/:id geeft 404 bij onbekend boek', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/books/999999' });
    expect(res.statusCode).toBe(404);
  });
});
