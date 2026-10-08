import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApi(app: NestFastifyApplication) {
  const config = new DocumentBuilder().setTitle('BiblioApp API').setVersion('0.1.0').build();
  return SwaggerModule.createDocument(app, config);
}

export function setup(app: NestFastifyApplication) {
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true });
}
