import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../loans/errors';
import {
  DEFAULT_TEMPLATES,
  LOCALES,
  NOTIFICATION_TYPES,
  NotificationType,
  PLACEHOLDERS,
  Locale,
} from '../notifications/templates';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async users(q?: string) {
    const term = q?.trim();
    const rows = await this.prisma.user.findMany({
      where: term
        ? {
            OR: [
              { email: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: { member: { select: { memberNumber: true } } },
      orderBy: { email: 'asc' },
      take: 100,
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      memberNumber: u.member?.memberNumber ?? null,
      disabled: !!u.disabledAt,
      totpEnabled: !!u.totpEnabledAt,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  /** Rol wijzigen of account (de)activeren. Je kunt jezelf niet degraderen en de laatste actieve admin niet verwijderen. */
  async updateUser(id: number, patch: { role?: Role; disabled?: boolean }, actorId: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user)
      throw new DomainError('Gebruiker niet gevonden', 'USER_NOT_FOUND', HttpStatus.NOT_FOUND);
    const losesAdmin =
      user.role === 'ADMIN' && ((patch.role && patch.role !== 'ADMIN') || patch.disabled === true);
    if (id === actorId && (losesAdmin || patch.disabled === true)) {
      throw new DomainError(
        'Je kunt je eigen beheerdersrechten of account niet uitschakelen',
        'SELF_LOCKOUT',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      if (losesAdmin) {
        // Serialiseer op de adminrijen zodat twee gelijktijdige degradaties niet de laatste admin wegnemen.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "role" = 'ADMIN' FOR UPDATE`;
        const others = await tx.user.count({
          where: { role: 'ADMIN', disabledAt: null, id: { not: id } },
        });
        if (others === 0)
          throw new DomainError(
            'Er moet minimaal één actieve beheerder blijven',
            'LAST_ADMIN',
            HttpStatus.CONFLICT,
          );
      }
      await tx.user.update({
        where: { id },
        data: {
          ...(patch.role !== undefined && { role: patch.role }),
          ...(patch.disabled !== undefined && { disabledAt: patch.disabled ? new Date() : null }),
        },
      });
      // Rechten of status gewijzigd: alle bestaande sessies ongeldig maken
      if (patch.role !== undefined || patch.disabled === true)
        await tx.session.deleteMany({ where: { userId: id } });
    });
    await this.audit.log('admin.user_update', actorId, { userId: id, ...patch });
    return (await this.users()).find((u) => u.id === id)!;
  }

  async auditLog(filter: { action?: string; userId?: number; page?: number; pageSize?: number }) {
    const pageSize = Math.min(filter.pageSize ?? 50, 200);
    const page = Math.max(filter.page ?? 1, 1);
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.action && { action: { startsWith: filter.action } }),
      ...(filter.userId && { userId: filter.userId }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        userId: r.userId,
        userEmail: r.user?.email ?? null,
        detail: r.detail ? JSON.stringify(r.detail) : null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // ---- e-mailtemplates ----

  async templates() {
    const custom = await this.prisma.emailTemplate.findMany();
    const out = [];
    for (const type of NOTIFICATION_TYPES) {
      for (const locale of LOCALES) {
        const c = custom.find((t) => t.type === type && t.locale === locale);
        const d = DEFAULT_TEMPLATES[type][locale];
        out.push({
          type,
          locale,
          subject: c?.subject ?? d.title,
          body: c?.body ?? d.body,
          customized: !!c,
          defaultSubject: d.title,
          defaultBody: d.body,
          placeholders: [...PLACEHOLDERS],
        });
      }
    }
    return out;
  }

  private check(type: string, locale: string): asserts type is NotificationType {
    if (
      !(NOTIFICATION_TYPES as readonly string[]).includes(type) ||
      !(LOCALES as string[]).includes(locale)
    ) {
      throw new DomainError('Onbekend template', 'TEMPLATE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
  }

  async saveTemplate(type: string, locale: string, subject: string, body: string, actorId: number) {
    this.check(type, locale);
    await this.prisma.emailTemplate.upsert({
      where: { type_locale: { type, locale } },
      update: { subject, body },
      create: { type, locale, subject, body },
    });
    await this.audit.log('admin.template_save', actorId, { type, locale });
    return (await this.templates()).find(
      (t) => t.type === type && t.locale === (locale as Locale),
    )!;
  }

  async resetTemplate(type: string, locale: string, actorId: number) {
    this.check(type, locale);
    await this.prisma.emailTemplate.deleteMany({ where: { type, locale } });
    await this.audit.log('admin.template_reset', actorId, { type, locale });
  }
}
