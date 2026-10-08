import 'reflect-metadata';
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { buildOpenApi, setup } from './setup';

async function main() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await setup(app);
  await app.init();
  writeFileSync(
    join(__dirname, '..', 'openapi.json'),
    JSON.stringify(buildOpenApi(app), null, 2) + '\n',
  );
  await app.close();
}
void main();
