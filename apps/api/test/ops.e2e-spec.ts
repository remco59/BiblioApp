import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp, createUser, resetCatalog, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Operations (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
  });
  afterAll(() => app.close());
  afterEach(() => {
    delete process.env.METRICS_TOKEN;
  });

  it('stuurt beveiligingsheaders mee en een request-id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('health is liveness, health/ready controleert database, migraties en jobs', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({
      status: 'ok',
      database: true,
    });
    const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready', database: true, migrations: true, jobs: true });
  });

  describe('metrics', () => {
    it('vereist het token zodra METRICS_TOKEN is gezet', async () => {
      process.env.METRICS_TOKEN = 'een-lang-genoeg-token-123';
      expect((await app.inject({ method: 'GET', url: '/api/metrics' })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/metrics',
            headers: { authorization: 'Bearer fout' },
          })
        ).statusCode,
      ).toBe(401);
      const ok = await app.inject({
        method: 'GET',
        url: '/api/metrics',
        headers: { authorization: 'Bearer een-lang-genoeg-token-123' },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.headers['content-type']).toContain('text/plain');
    });

    it('bevat http- en bedrijfsmetrics', async () => {
      await resetCatalog(prisma);
      await resetDb(prisma);
      const u = await createUser(prisma, 'm@example.nl', 'MEMBER');
      const m = await prisma.member.findUniqueOrThrow({ where: { userId: u.id } });
      const book = await prisma.book.create({ data: { title: 'T' } });
      const copy = await prisma.copy.create({
        data: { bookId: book.id, barcode: 'M1', status: 'LOANED' },
      });
      await prisma.loan.create({
        data: { copyId: copy.id, memberId: m.id, dueAt: new Date(Date.now() - 86400000) },
      });
      await app.inject({ method: 'GET', url: '/api/books' });

      const text = (await app.inject({ method: 'GET', url: '/api/metrics' })).body;
      expect(text).toMatch(/^biblio_loans_active\{service="biblio-api"\} 1$/m);
      expect(text).toMatch(/^biblio_loans_overdue\{service="biblio-api"\} 1$/m);
      expect(text).toMatch(/^biblio_members_total\{service="biblio-api"\} 1$/m);
      expect(text).toMatch(
        /http_request_duration_seconds_count\{[^}]*route="\/api\/books"[^}]*status="200"/,
      );
      expect(text).toContain('process_cpu_user_seconds_total');
    });

    it('weigert in productie zonder token', async () => {
      const env = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect((await app.inject({ method: 'GET', url: '/api/metrics' })).statusCode).toBe(401);
      } finally {
        process.env.NODE_ENV = env;
      }
    });
  });

  describe('algemene rate limit', () => {
    it('begrenst verzoeken per IP, maar laat health door', async () => {
      process.env.RATE_LIMIT_MAX = '5';
      const limited = (await createApp()).app;
      try {
        const codes: number[] = [];
        for (let i = 0; i < 8; i++)
          codes.push((await limited.inject({ method: 'GET', url: '/api/books' })).statusCode);
        expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
        const blocked = await limited.inject({ method: 'GET', url: '/api/books' });
        expect(blocked.json()).toMatchObject({
          statusCode: 429,
          message: expect.stringContaining('Te veel verzoeken'),
        });
        expect(blocked.headers['retry-after']).toBeTruthy();
        // Monitoring mag nooit geblokkeerd worden
        for (let i = 0; i < 10; i++)
          expect((await limited.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(
            200,
          );
      } finally {
        await limited.close();
        process.env.RATE_LIMIT_MAX = '1000000';
      }
    });
  });
});
