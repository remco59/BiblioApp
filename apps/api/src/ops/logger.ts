import { LoggerService } from '@nestjs/common';
import pino, { Logger } from 'pino';

export const REDACT = {
  paths: [
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
    '*.password',
    '*.passwordHash',
    '*.token',
    '*.totp',
  ],
  censor: '[verwijderd]',
};

/** Gestructureerde JSON-logs (stdout); gevoelige headers worden gewist. */
export function createLogger(env: NodeJS.ProcessEnv = process.env): Logger {
  const isProd = env.NODE_ENV === 'production';
  return pino({
    level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
    redact: REDACT,
    base: { service: 'biblio-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(!isProd && env.NODE_ENV !== 'test' && env.LOG_PRETTY !== '0'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
          },
        }
      : {}),
  });
}

/** Laat Nest's eigen `Logger` (services, modules) via pino lopen. */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}
  log(message: unknown, context?: string) {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    this.logger.trace({ context }, String(message));
  }
}
