import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

const KEY = 'rateLimit';

/** Beperkt het aantal calls per IP voor deze route (in-memory; per proces). */
export const RateLimit = (name: string) => SetMetadata(KEY, name);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const name = this.reflector.getAllAndOverride<string | undefined>(KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!name) return true;
    const max = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);
    const windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000);
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      throw new HttpException(
        'Te veel verzoeken, probeer het later opnieuw',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
