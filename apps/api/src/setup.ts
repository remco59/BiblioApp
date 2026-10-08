import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { ValidationPipe } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MetricsService } from './ops/metrics.service';

export function buildOpenApi(app: NestFastifyApplication) {
  const config = new DocumentBuilder().setTitle('BiblioApp API').setVersion('0.1.0').build();
  return SwaggerModule.createDocument(app, config);
}

export const docsEnabled = () =>
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === '1';

export async function setup(app: NestFastifyApplication) {
  const fastify = app.getHttpAdapter().getInstance();

  // Beveiligingsheaders. De API levert alleen JSON en afbeeldingen, dus een strikte CSP is veilig;
  // de Swagger-UI (alleen als die aan staat) heeft inline scripts nodig.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: docsEnabled()
      ? false
      : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    hsts:
      process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

  // Algemene limiet per IP (in-memory, per proces). Inlog-/registratieroutes hebben een strengere eigen limiet.
  await app.register(fastifyRateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: '1 minute',
    allowList: (req) =>
      req.url.startsWith('/api/health') ||
      req.url.startsWith('/api/metrics') ||
      req.url.startsWith('/api/events'),
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      message: 'Te veel verzoeken, probeer het later opnieuw',
      retryAfterSeconds: Math.ceil(ctx.ttl / 1000),
    }),
  });

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
  // CSV-import: ruwe tekst als body
  fastify.addContentTypeParser(
    'text/csv',
    { parseAs: 'string', bodyLimit: 5 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  // Metrics per route (patroon, geen ruwe URL: beperkt het aantal labelwaarden)
  const metrics = app.get(MetricsService);
  fastify.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? 'onbekend';
    if (route.startsWith('/api/metrics')) return;
    const status = String(reply.statusCode);
    metrics.httpDuration.observe({ method: req.method, route, status }, reply.elapsedTime / 1000);
    if (reply.statusCode >= 500) metrics.httpErrors.inc({ route, status });
  });
  fastify.addHook('onSend', async (req, reply) => {
    void reply.header('X-Request-Id', req.id);
  });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();
}
