import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import fastifyCookie from '@fastify/cookie';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApi(app: NestFastifyApplication) {
  const config = new DocumentBuilder().setTitle('BiblioApp API').setVersion('0.1.0').build();
  return SwaggerModule.createDocument(app, config);
}

export async function setup(app: NestFastifyApplication) {
  await app.register(fastifyCookie);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true });
}
