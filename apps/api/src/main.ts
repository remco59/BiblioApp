import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApi, setup } from './setup';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await setup(app);
  SwaggerModule.setup('api/docs', app, buildOpenApi(app));
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
