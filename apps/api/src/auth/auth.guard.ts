import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { AuthUser, IS_PUBLIC, ROLES } from './decorators';

export const SESSION_COOKIE = 'sid';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type AuthedRequest = FastifyRequest & { user?: AuthUser };

/** Globale guard: sessie, CSRF en rollen worden server-side afgedwongen. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    const cookie = req.cookies?.[SESSION_COOKIE];
    const session = cookie ? await this.auth.findSession(cookie) : null;
    if (session && !session.user.disabledAt) {
      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
        sessionId: session.id,
        csrfToken: session.csrfToken,
      };
    }

    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException();

    if (!SAFE_METHODS.has(req.method) && req.headers['x-csrf-token'] !== req.user.csrfToken) {
      throw new ForbiddenException('Ongeldig CSRF-token');
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(req.user.role)) throw new ForbiddenException();
    return true;
  }
}
