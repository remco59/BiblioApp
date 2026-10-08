import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApi(app: NestFastifyApplication) {
  const config = new DocumentBuilder().setTitle('BiblioApp API').setVersion('0.1.0').build();
  return SwaggerModule.createDocument(app, config);
}

export async function setup(app: NestFastifyApplication) {
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
  // CSV-import: ruwe tekst als body
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      'text/csv',
      { parseAs: 'string', bodyLimit: 5 * 1024 * 1024 },
      (_req, body, done) => done(null, body),
    );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true });
}
