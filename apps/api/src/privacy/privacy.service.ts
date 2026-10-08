import { HttpStatus, Injectable } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../loans/errors';
import { LoansService } from '../loans/loans.service';
import { SettingsService } from '../loans/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';

const DAY = 24 * 3600 * 1000;
const monthsAgo = (now: Date, months: number) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
};

export interface RetentionResult {
  deleted: number;
  anonymized: number;
}

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly loans: LoansService,
    private readonly reservations: ReservationsService,
    private readonly audit: AuditService,
  ) {}

  /** Openbaar privacybeleid: welke bewaartermijnen gelden er nu. */
  async policy() {
    const s = await this.settings.getAll();
    return {
      retentionLoanMonths: s.retentionLoanMonths,
      retentionAuditMonths: s.retentionAuditMonths,
      retentionNotificationDays: s.retentionNotificationDays,
      retentionInactiveMemberMonths: s.retentionInactiveMemberMonths,
    };
  }

  /** Alle gegevens van een gebruiker (AVG: recht op inzage en overdraagbaarheid). */
  async exportFor(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        emailVerifiedAt: true,
        totpEnabledAt: true,
        createdAt: true,
      },
    });
    const member = await this.prisma.member.findUnique({ where: { userId } });
    const memberId = member?.id ?? -1;
    const [loans, fines, reservations, reviews, wishlist, suggestions, notifications, audit] =
      await Promise.all([
        this.prisma.loan.findMany({
          where: { memberId },
          include: { copy: { include: { book: { select: { title: true } } } } },
          orderBy: { loanedAt: 'asc' },
        }),
        this.prisma.fine.findMany({
          where: { memberId },
          include: { payments: true },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.reservation.findMany({
          where: { memberId },
          include: { book: { select: { title: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.review.findMany({
          where: { userId },
          include: { book: { select: { title: true } } },
        }),
        this.prisma.wishlistItem.findMany({
          where: { userId },
          include: { book: { select: { title: true } } },
        }),
        this.prisma.suggestion.findMany({ where: { userId } }),
        this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.auditLog.findMany({
          where: { userId },
          select: { action: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
    return {
      exportedAt: new Date().toISOString(),
      user,
      member: member && {
        memberNumber: member.memberNumber,
        membershipUntil: member.membershipUntil,
        blocked: member.blocked,
        createdAt: member.createdAt,
      },
      loans: loans.map((l) => ({
        title: l.copy.book.title,
        loanedAt: l.loanedAt,
        dueAt: l.dueAt,
        returnedAt: l.returnedAt,
        outcome: l.outcome,
        renewals: l.renewals,
      })),
      fines: fines.map((f) => ({
        reason: f.reason,
        amountCents: f.amountCents,
        createdAt: f.createdAt,
        waivedAt: f.waivedAt,
        payments: f.payments.map((p) => ({
          amountCents: p.amountCents,
          method: p.method,
          paidAt: p.paidAt,
        })),
      })),
      reservations: reservations.map((r) => ({
        title: r.book.title,
        status: r.status,
        createdAt: r.createdAt,
        readyAt: r.readyAt,
        expiresAt: r.expiresAt,
      })),
      reviews: reviews.map((r) => ({
        title: r.book.title,
        rating: r.rating,
        body: r.body,
        status: r.status,
        createdAt: r.createdAt,
      })),
      wishlist: wishlist.map((w) => ({ title: w.book.title, addedAt: w.createdAt })),
      suggestions: suggestions.map((s) => ({
        title: s.title,
        author: s.author,
        isbn: s.isbn,
        reason: s.reason,
        status: s.status,
        createdAt: s.createdAt,
      })),
      notifications: notifications.map((n) => ({
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        readAt: n.readAt,
      })),
      activity: audit,
    };
  }

  /**
   * Recht op vergetelheid: persoonsgegevens worden gewist of onherkenbaar gemaakt. De rij blijft bestaan
   * (geanonimiseerd) zodat historische uitleningen en boetes consistent blijven tot ze door de
   * bewaartermijn worden verwijderd. Niet mogelijk met lopende uitleningen of openstaande boetes.
   */
  async anonymize(userId: number, actorId: number | null): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { member: true },
    });
    if (!user)
      throw new DomainError('Gebruiker niet gevonden', 'USER_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (user.role === 'ADMIN')
      throw new DomainError(
        'Beheerdersaccounts kunnen niet worden verwijderd: verlaag eerst de rol',
        'ADMIN_ACCOUNT',
        HttpStatus.CONFLICT,
      );
    if (user.email.endsWith('@anonymized.invalid')) return; // al gedaan

    if (user.member) {
      if (await this.prisma.loan.count({ where: { memberId: user.member.id, returnedAt: null } })) {
        throw new DomainError('Je hebt nog uitgeleende boeken: lever die eerst in', 'ACTIVE_LOANS');
      }
      if ((await this.loans.outstandingFines(user.member.id)) > 0) {
        throw new DomainError('Er staan nog boetes open: betaal die eerst', 'OUTSTANDING_FINES');
      }
      // Lopende reserveringen annuleren (geeft vastgehouden exemplaren door aan de volgende)
      const active = await this.prisma.reservation.findMany({
        where: { memberId: user.member.id, status: { in: ['WAITING', 'READY'] } },
        select: { id: true },
      });
      for (const r of active)
        await this.reservations.cancel(r.id, { id: actorId ?? userId, isStaff: true });
    }

    const unusable = await hash(randomBytes(32).toString('hex'));
    await this.prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId } });
      await tx.emailToken.deleteMany({ where: { userId } });
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.wishlistItem.deleteMany({ where: { userId } });
      await tx.suggestion.deleteMany({ where: { userId } });
      await tx.review.deleteMany({ where: { userId } });
      await tx.reservation.deleteMany({ where: { member: { userId } } });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `verwijderd-${userId}@anonymized.invalid`,
          name: 'Verwijderd lid',
          passwordHash: unusable,
          emailVerifiedAt: null,
          disabledAt: new Date(),
          totpSecret: null,
          totpEnabledAt: null,
          totpLastStep: null,
          locale: 'nl',
        },
      });
      if (user.member) {
        await tx.member.update({
          where: { id: user.member.id },
          data: {
            memberNumber: `ANON-${user.member.id}`,
            blocked: true,
            blockedReason: 'Geanonimiseerd',
            expiryNoticeFor: null,
          },
        });
      }
      // Audit-regels blijven (zonder persoonsgegevens: ze verwijzen alleen naar het geanonimiseerde account)
      await tx.auditLog.create({
        data: { userId, action: 'privacy.anonymize', detail: { by: actorId } },
      });
    });
  }

  /** Verwijdert gegevens die de bewaartermijn hebben overschreden en anonimiseert inactieve leden. */
  async runRetention(now = new Date()): Promise<RetentionResult> {
    const s = await this.settings.getAll();
    const p = this.prisma;
    let deleted = 0;
    const count = (r: { count: number }) => (deleted += r.count);

    const loanCutoff = monthsAgo(now, s.retentionLoanMonths);
    // Afgehandelde boetes (betaald of kwijtgescholden) van oude uitleningen
    const oldFines = await p.fine.findMany({
      where: { createdAt: { lt: loanCutoff } },
      select: {
        id: true,
        amountCents: true,
        waivedAt: true,
        payments: { select: { amountCents: true } },
      },
    });
    const settled = oldFines
      .filter(
        (f) => f.waivedAt || f.payments.reduce((a, x) => a + x.amountCents, 0) >= f.amountCents,
      )
      .map((f) => f.id);
    if (settled.length) count(await p.fine.deleteMany({ where: { id: { in: settled } } }));
    // Openstaande boetes blijven, maar verliezen de koppeling met de te verwijderen uitleen
    const oldLoans = await p.loan.findMany({
      where: { returnedAt: { lt: loanCutoff } },
      select: { id: true },
    });
    if (oldLoans.length) {
      const ids = oldLoans.map((l) => l.id);
      await p.fine.updateMany({ where: { loanId: { in: ids } }, data: { loanId: null } });
      count(await p.loan.deleteMany({ where: { id: { in: ids } } }));
    }
    count(
      await p.reservation.deleteMany({
        where: {
          status: { in: ['FULFILLED', 'CANCELLED', 'EXPIRED'] },
          closedAt: { lt: monthsAgo(now, 3) },
        },
      }),
    );
    count(
      await p.notification.deleteMany({
        where: {
          OR: [
            { readAt: { lt: new Date(now.getTime() - s.retentionNotificationDays * DAY) } },
            { createdAt: { lt: monthsAgo(now, 12) } },
          ],
        },
      }),
    );
    count(
      await p.auditLog.deleteMany({
        where: { createdAt: { lt: monthsAgo(now, s.retentionAuditMonths) } },
      }),
    );
    count(await p.session.deleteMany({ where: { expiresAt: { lt: now } } }));
    count(
      await p.emailToken.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - 7 * DAY) } },
      }),
    );

    // Inactieve leden: lidmaatschap lang verlopen, geen recente uitleen, geen open boetes, geen lopende uitleen
    const inactiveCutoff = monthsAgo(now, s.retentionInactiveMemberMonths);
    const candidates = await p.member.findMany({
      where: {
        membershipUntil: { lt: inactiveCutoff },
        user: { role: 'MEMBER', email: { not: { endsWith: '@anonymized.invalid' } } },
        loans: { none: { OR: [{ returnedAt: null }, { loanedAt: { gte: inactiveCutoff } }] } },
      },
      select: { userId: true },
    });
    let anonymized = 0;
    for (const c of candidates) {
      try {
        await this.anonymize(c.userId, null);
        anonymized++;
      } catch {
        /* bijv. openstaande boete: overslaan */
      }
    }
    if (deleted || anonymized) await this.audit.log('job.retention', null, { deleted, anonymized });
    return { deleted, anonymized };
  }
}
