import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JobsService, NIGHTLY_JOB } from '../jobs/jobs.service';
import { daysLate } from '../loans/loans.service';
import { DomainError } from '../loans/errors';
import { SettingsService } from '../loans/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NightlyResultDto } from './dto';
import { ReservationsService } from './reservations.service';

const DAY = 24 * 3600 * 1000;

/** Nachtelijke onderhoudsjobs; elke stap is idempotent en per item afgeschermd. */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly reservations: ReservationsService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register(NIGHTLY_JOB, async () => {
      const result = await this.runNightly();
      this.logger.log(`Nachtelijke job klaar: ${JSON.stringify(result)}`);
    });
  }

  async runNightly(now = new Date()): Promise<NightlyResultDto> {
    const s = await this.settings.getAll();
    const result: NightlyResultDto = {
      reminders: 0,
      overdueNotices: 0,
      finesUpdated: 0,
      reservationsExpired: 0,
      membershipNotices: 0,
    };
    const step = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        this.logger.error(`${name} mislukt: ${(e as Error).message}`);
      }
    };

    // 1. Herinnering vóór de uiterste datum
    const soon = await this.prisma.loan.findMany({
      where: {
        returnedAt: null,
        reminderSentAt: null,
        dueAt: { gte: now, lte: new Date(now.getTime() + s.reminderDays * DAY) },
      },
      include: { copy: { include: { book: { select: { title: true } } } }, member: true },
    });
    for (const loan of soon) {
      await step(`herinnering ${loan.id}`, async () => {
        const n = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.loan.updateMany({
            where: { id: loan.id, reminderSentAt: null },
            data: { reminderSentAt: now },
          });
          if (claimed.count === 0) return null;
          return this.notifications.create(tx, loan.member.userId, 'LOAN_DUE_SOON', {
            title: loan.copy.book.title,
            date: loan.dueAt,
          });
        });
        if (n) {
          await this.notifications.dispatch([n]);
          result.reminders++;
        }
      });
    }

    // 2. Te laat: boete bijwerken en (periodiek) aanmaning versturen
    const overdue = await this.prisma.loan.findMany({
      where: { returnedAt: null, dueAt: { lt: now } },
      select: { id: true, overdueNoticeAt: true },
    });
    for (const loan of overdue) {
      await step(`te laat ${loan.id}`, async () => {
        if (await this.updateOverdueFine(loan.id, now)) result.finesUpdated++;
        const stale =
          !loan.overdueNoticeAt ||
          now.getTime() - loan.overdueNoticeAt.getTime() >= s.overdueNoticeEveryDays * DAY;
        if (stale && (await this.sendOverdueNotice(loan.id, now))) result.overdueNotices++;
      });
    }

    // 3. Verlopen reserveringen doorschuiven
    await step('reserveringen', async () => {
      result.reservationsExpired = await this.reservations.expireOverdue(now);
    });

    // 4. Lidmaatschapscontrole
    const expiring = await this.prisma.member.findMany({
      where: {
        membershipUntil: { gt: now, lte: new Date(now.getTime() + s.membershipNoticeDays * DAY) },
      },
    });
    for (const m of expiring) {
      if (m.expiryNoticeFor?.getTime() === m.membershipUntil.getTime()) continue;
      await step(`lidmaatschap ${m.id}`, async () => {
        const n = await this.prisma.$transaction(async (tx) => {
          await tx.member.update({
            where: { id: m.id },
            data: { expiryNoticeFor: m.membershipUntil },
          });
          return this.notifications.create(tx, m.userId, 'MEMBERSHIP_EXPIRING', {
            date: m.membershipUntil,
          });
        });
        await this.notifications.dispatch([n]);
        result.membershipNotices++;
      });
    }

    await this.audit.log('job.nightly', null, result as unknown as Prisma.InputJsonValue);
    return result;
  }

  /** Zorgt dat er één te-laat-boete per uitleen is met het actuele bedrag. Geeft terug of er iets veranderde. */
  async updateOverdueFine(loanId: number, now = new Date()): Promise<boolean> {
    const s = await this.settings.getAll();
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan || loan.returnedAt) return false;
    const late = daysLate(loan.dueAt, now);
    const amount = Math.min(late * s.finePerDayCents, s.fineCapCents);
    if (amount <= 0) return false;
    const existing = await this.prisma.fine.findFirst({ where: { loanId, reason: 'OVERDUE' } });
    if (existing) {
      if (existing.amountCents === amount || existing.waivedAt) return false;
      await this.prisma.fine.update({
        where: { id: existing.id },
        data: { amountCents: amount, note: `${late} dag(en) te laat` },
      });
      return true;
    }
    await this.prisma.fine.create({
      data: {
        memberId: loan.memberId,
        loanId,
        reason: 'OVERDUE',
        amountCents: amount,
        note: `${late} dag(en) te laat`,
      },
    });
    return true;
  }

  /** Aanmaning (melding + e-mail) voor een te late uitleen; ook handmatig door een medewerker. */
  async sendOverdueNotice(loanId: number, now = new Date()): Promise<Notification | null> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        copy: { include: { book: { select: { title: true } } } },
        member: true,
        fines: { where: { reason: 'OVERDUE' }, include: { payments: true } },
      },
    });
    if (!loan || loan.returnedAt) return null;
    const n = await this.prisma.$transaction(async (tx) => {
      await tx.loan.update({ where: { id: loanId }, data: { overdueNoticeAt: now } });
      return this.notifications.create(tx, loan.member.userId, 'LOAN_OVERDUE', {
        title: loan.copy.book.title,
        date: loan.dueAt,
        days: daysLate(loan.dueAt, now),
        amountCents: loan.fines.reduce((sum, f) => sum + f.amountCents, 0),
      });
    });
    await this.notifications.dispatch([n]);
    return n;
  }

  async remind(loanId: number, staffUserId: number) {
    const n = await this.sendOverdueNotice(loanId);
    if (!n) throw new DomainError('Uitleen is niet (meer) actief', 'LOAN_CLOSED');
    await this.audit.log('loan.remind', staffUserId, { loanId });
  }
}
