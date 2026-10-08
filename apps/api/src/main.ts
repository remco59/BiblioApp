import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnv } from './ops/env';
import { createLogger, NestPinoLogger } from './ops/logger';
import { buildOpenApi, docsEnabled, setup } from './setup';

async function bootstrap() {
  const problems = validateEnv(process.env);
  if (problems.length > 0) {
    console.error(`Ongeldige configuratie:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  const logger = createLogger();
  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    trustProxy: process.env.TRUST_PROXY !== '0', // achter Caddy: echte client-IP en https
    genReqId: (req: { headers: Record<string, string | string[] | undefined> }) =>
      (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID(),
    bodyLimit: 1024 * 1024,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  app.useLogger(new NestPinoLogger(logger));
  await setup(app);
  if (docsEnabled()) SwaggerModule.setup('api/docs', app, buildOpenApi(app));
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
