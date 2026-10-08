import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueEffects, ReservationsService } from '../reservations/reservations.service';
import { CheckinResultDto, FineDto, LoanDto } from './dto';
import { DomainError } from './errors';
import { SettingsService } from './settings.service';

const DAY = 24 * 3600 * 1000;

export const loanInclude = {
  copy: { include: { book: { select: { id: true, title: true } } } },
  member: { include: { user: { select: { name: true } } } },
} satisfies Prisma.LoanInclude;
type LoanRow = Prisma.LoanGetPayload<{ include: typeof loanInclude }>;

export const fineInclude = {
  payments: true,
  loan: { include: { copy: { include: { book: { select: { title: true } } } } } },
} satisfies Prisma.FineInclude;
type FineRow = Prisma.FineGetPayload<{ include: typeof fineInclude }>;

export function toFineDto(f: FineRow): FineDto {
  const paid = f.payments.reduce((s, p) => s + p.amountCents, 0);
  const status = f.waivedAt ? 'WAIVED' : paid >= f.amountCents ? 'PAID' : 'OPEN';
  return {
    id: f.id,
    memberId: f.memberId,
    loanId: f.loanId,
    title: f.loan?.copy.book.title ?? null,
    reason: f.reason,
    amountCents: f.amountCents,
    paidCents: paid,
    outstandingCents: status === 'OPEN' ? f.amountCents - paid : 0,
    status,
    createdAt: f.createdAt.toISOString(),
  };
}

/** Aantal begonnen dagen te laat (0 als op tijd). */
export function daysLate(dueAt: Date, now: Date): number {
  return now > dueAt ? Math.ceil((now.getTime() - dueAt.getTime()) / DAY) : 0;
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly reservations: ReservationsService,
  ) {}

  toDto(l: LoanRow, s: { maxRenewals: number }, now = new Date()): LoanDto {
    const active = !l.returnedAt;
    const overdue = active && l.dueAt < now;
    return {
      id: l.id,
      bookId: l.copy.book.id,
      title: l.copy.book.title,
      barcode: l.copy.barcode,
      memberId: l.memberId,
      memberNumber: l.member.memberNumber,
      memberName: l.member.user.name,
      loanedAt: l.loanedAt.toISOString(),
      dueAt: l.dueAt.toISOString(),
      returnedAt: l.returnedAt?.toISOString() ?? null,
      outcome: l.outcome,
      renewals: l.renewals,
      overdue,
      canRenew: active && !overdue && l.renewals < s.maxRenewals,
      daysLate: overdue ? daysLate(l.dueAt, now) : 0,
      lastNoticeAt: l.overdueNoticeAt?.toISOString() ?? null,
    };
  }

  /** Som van openstaande boetes voor een lid (in centen). */
  async outstandingFines(
    memberId: number,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const fines = await db.fine.findMany({
      where: { memberId, waivedAt: null },
      include: { payments: true },
    });
    return fines.reduce(
      (sum, f) =>
        sum + Math.max(0, f.amountCents - f.payments.reduce((s, p) => s + p.amountCents, 0)),
      0,
    );
  }

  /**
   * Uitlenen in één transactie. Het exemplaar en het lid worden met `SELECT … FOR UPDATE`
   * vergrendeld, zodat gelijktijdige uitleningen elkaar niet kunnen passeren (geen dubbel
   * uitlenen, leenlimiet blijft kloppen).
   */
  async checkout(memberNumber: string, barcode: string, staffUserId: number): Promise<LoanDto> {
    const effects: QueueEffects = { notifications: [], bookIds: [] };
    const loanId = await this.prisma.$transaction(async (tx) => {
      const [copy] = await tx.$queryRaw<{ id: number; status: string; bookId: number }[]>`
        SELECT "id", "status", "bookId" FROM "Copy" WHERE "barcode" = ${barcode} FOR UPDATE`;
      if (!copy)
        throw new DomainError('Exemplaar niet gevonden', 'COPY_NOT_FOUND', HttpStatus.NOT_FOUND);

      const [m] = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "Member" WHERE "memberNumber" = ${memberNumber} FOR UPDATE`;
      if (!m) throw new DomainError('Lid niet gevonden', 'MEMBER_NOT_FOUND', HttpStatus.NOT_FOUND);
      const member = await tx.member.findUniqueOrThrow({ where: { id: m.id } });
      const s = await this.settings.getAll(tx);

      if (copy.status === 'RESERVED_HOLD') {
        // Een klaargelegd exemplaar mag alleen aan het lid dat het gereserveerd heeft.
        const hold = await tx.reservation.findFirst({
          where: { copyId: copy.id, status: 'READY' },
        });
        if (!hold || hold.memberId !== member.id) {
          throw new DomainError(
            'Dit exemplaar ligt klaar voor een reservering van een ander lid',
            'COPY_RESERVED_HOLD',
          );
        }
      } else if (copy.status !== 'AVAILABLE') {
        const msg =
          copy.status === 'LOANED'
            ? 'Dit exemplaar is al uitgeleend'
            : 'Dit exemplaar is niet uitleenbaar (verloren of beschadigd)';
        throw new DomainError(msg, `COPY_${copy.status}`);
      }
      if (member.blocked)
        throw new DomainError(
          `Lid is geblokkeerd${member.blockedReason ? `: ${member.blockedReason}` : ''}`,
          'MEMBER_BLOCKED',
          HttpStatus.FORBIDDEN,
        );
      if (member.membershipUntil < new Date())
        throw new DomainError(
          'Lidmaatschap is verlopen',
          'MEMBERSHIP_EXPIRED',
          HttpStatus.FORBIDDEN,
        );
      const fines = await this.outstandingFines(member.id, tx);
      if (fines >= s.blockFinesThresholdCents && fines > 0) {
        throw new DomainError(
          'Lid heeft openstaande boetes die eerst betaald moeten worden',
          'OUTSTANDING_FINES',
          HttpStatus.FORBIDDEN,
        );
      }
      const active = await tx.loan.count({ where: { memberId: member.id, returnedAt: null } });
      if (active >= s.maxLoansPerMember) {
        throw new DomainError(
          `Leenlimiet bereikt (${s.maxLoansPerMember} boeken)`,
          'LOAN_LIMIT',
          HttpStatus.FORBIDDEN,
        );
      }

      const loan = await tx.loan.create({
        data: {
          copyId: copy.id,
          memberId: member.id,
          dueAt: new Date(Date.now() + s.loanDays * DAY),
          loanedById: staffUserId,
        },
      });
      await tx.copy.update({ where: { id: copy.id }, data: { status: 'LOANED' } });
      await this.reservations.fulfillOnCheckout(tx, member.id, copy.bookId, copy.id, effects);
      effects.bookIds.push(copy.bookId);
      return loan.id;
    });
    await this.audit.log('loan.checkout', staffUserId, { loanId, barcode, memberNumber });
    await this.reservations.publish(effects);
    return this.get(loanId);
  }

  async get(id: number): Promise<LoanDto> {
    const l = await this.prisma.loan.findUnique({ where: { id }, include: loanInclude });
    if (!l) throw new NotFoundException('Uitleen niet gevonden');
    return this.toDto(l, await this.settings.getAll());
  }

  /** Innemen: sluit de actieve uitleen, berekent boetes en geeft het exemplaar door aan de wachtrij. */
  async checkin(
    barcode: string,
    condition: 'OK' | 'DAMAGED',
    staffUserId: number,
  ): Promise<CheckinResultDto> {
    const effects: QueueEffects = { notifications: [], bookIds: [] };
    const { loanId, fineId, late, reservedFor } = await this.prisma.$transaction(async (tx) => {
      const [copy] = await tx.$queryRaw<
        { id: number; bookId: number }[]
      >`SELECT "id", "bookId" FROM "Copy" WHERE "barcode" = ${barcode} FOR UPDATE`;
      if (!copy)
        throw new DomainError('Exemplaar niet gevonden', 'COPY_NOT_FOUND', HttpStatus.NOT_FOUND);
      const loan = await tx.loan.findFirst({ where: { copyId: copy.id, returnedAt: null } });
      if (!loan) throw new DomainError('Dit exemplaar is niet uitgeleend', 'NOT_ON_LOAN');
      const s = await this.settings.getAll(tx);
      const now = new Date();
      const late = daysLate(loan.dueAt, now);

      await tx.loan.update({
        where: { id: loan.id },
        data: {
          returnedAt: now,
          returnedById: staffUserId,
          outcome: condition === 'DAMAGED' ? 'DAMAGED' : 'RETURNED',
        },
      });
      await tx.copy.update({
        where: { id: copy.id },
        data: { status: condition === 'DAMAGED' ? 'DAMAGED' : 'AVAILABLE' },
      });

      let fineId: number | null = null;
      const overdueCents = Math.min(late * s.finePerDayCents, s.fineCapCents);
      if (overdueCents > 0) {
        // De nachtelijke job houdt al een te-laat-boete bij: bijwerken in plaats van dubbel aanmaken.
        const existing = await tx.fine.findFirst({ where: { loanId: loan.id, reason: 'OVERDUE' } });
        fineId = existing
          ? (
              await tx.fine.update({
                where: { id: existing.id },
                data: {
                  amountCents: Math.max(existing.amountCents, overdueCents),
                  note: `${late} dag(en) te laat`,
                },
              })
            ).id
          : (
              await tx.fine.create({
                data: {
                  memberId: loan.memberId,
                  loanId: loan.id,
                  reason: 'OVERDUE',
                  amountCents: overdueCents,
                  note: `${late} dag(en) te laat`,
                },
              })
            ).id;
      }
      if (condition === 'DAMAGED' && s.damagedFeeCents > 0) {
        fineId = (
          await tx.fine.create({
            data: {
              memberId: loan.memberId,
              loanId: loan.id,
              reason: 'DAMAGED',
              amountCents: s.damagedFeeCents,
            },
          })
        ).id;
      }

      effects.bookIds.push(copy.bookId);
      let reservedFor: string | null = null;
      if (condition === 'OK') {
        await this.reservations.fillQueue(tx, copy.bookId, effects);
        const hold = await tx.reservation.findFirst({
          where: { copyId: copy.id, status: 'READY' },
          include: { member: { include: { user: { select: { name: true } } } } },
        });
        reservedFor = hold?.member.user.name ?? null;
      }
      const returner = await tx.member.findUniqueOrThrow({
        where: { id: loan.memberId },
        select: { userId: true },
      });
      effects.skipWishlistUserIds = [returner.userId];
      return { loanId: loan.id, fineId, late, reservedFor };
    });
    await this.audit.log('loan.checkin', staffUserId, {
      loanId,
      barcode,
      condition,
      daysLate: late,
    });
    await this.reservations.publish(effects);
    return {
      loan: await this.get(loanId),
      fine: fineId ? await this.fine(fineId) : null,
      daysLate: late,
      reservedFor,
    };
  }

  /** Verloren: sluit de uitleen, zet het exemplaar op LOST en rekent de vervangingskosten aan. */
  async markLost(loanId: number, staffUserId: number): Promise<CheckinResultDto> {
    const fineId = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ copyId: number; returnedAt: Date | null }[]>`
        SELECT "copyId", "returnedAt" FROM "Loan" WHERE "id" = ${loanId} FOR UPDATE`;
      if (!row)
        throw new DomainError('Uitleen niet gevonden', 'LOAN_NOT_FOUND', HttpStatus.NOT_FOUND);
      if (row.returnedAt) throw new DomainError('Uitleen is al afgesloten', 'LOAN_CLOSED');
      const s = await this.settings.getAll(tx);
      const loan = await tx.loan.update({
        where: { id: loanId },
        data: { returnedAt: new Date(), returnedById: staffUserId, outcome: 'LOST' },
      });
      await tx.copy.update({ where: { id: row.copyId }, data: { status: 'LOST' } });
      if (s.lostFeeCents <= 0) return null;
      return (
        await tx.fine.create({
          data: {
            memberId: loan.memberId,
            loanId,
            reason: 'LOST',
            amountCents: s.lostFeeCents,
            note: 'Verloren exemplaar',
          },
        })
      ).id;
    });
    await this.audit.log('loan.lost', staffUserId, { loanId });
    return {
      loan: await this.get(loanId),
      fine: fineId ? await this.fine(fineId) : null,
      daysLate: 0,
      reservedFor: null,
    };
  }

  /** Verlengen door lid (eigen uitleen) of medewerker. */
  async renew(loanId: number, actor: { id: number; isStaff: boolean }): Promise<LoanDto> {
    await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { id: number }[]
      >`SELECT "id" FROM "Loan" WHERE "id" = ${loanId} FOR UPDATE`;
      const loan = locked
        ? await tx.loan.findUnique({ where: { id: loanId }, include: { member: true, copy: true } })
        : null;
      if (!loan || (!actor.isStaff && loan.member.userId !== actor.id)) {
        throw new DomainError('Uitleen niet gevonden', 'LOAN_NOT_FOUND', HttpStatus.NOT_FOUND);
      }
      const s = await this.settings.getAll(tx);
      if (loan.returnedAt) throw new DomainError('Uitleen is al afgesloten', 'LOAN_CLOSED');
      if (loan.member.blocked)
        throw new DomainError('Lid is geblokkeerd', 'MEMBER_BLOCKED', HttpStatus.FORBIDDEN);
      if (loan.member.membershipUntil < new Date())
        throw new DomainError(
          'Lidmaatschap is verlopen',
          'MEMBERSHIP_EXPIRED',
          HttpStatus.FORBIDDEN,
        );
      if (loan.dueAt < new Date())
        throw new DomainError('Te laat: lever het boek eerst in', 'OVERDUE');
      if (loan.renewals >= s.maxRenewals)
        throw new DomainError(`Maximaal ${s.maxRenewals}× verlengen`, 'MAX_RENEWALS');
      if (await this.hasWaitingReservation(loan.copy.bookId, tx)) {
        throw new DomainError(
          'Verlengen niet mogelijk: er staat een reservering op dit boek',
          'RESERVED',
        );
      }
      await tx.loan.update({
        where: { id: loanId },
        data: {
          dueAt: new Date(loan.dueAt.getTime() + s.renewalDays * DAY),
          renewals: { increment: 1 },
        },
      });
    });
    await this.audit.log('loan.renew', actor.id, { loanId });
    return this.get(loanId);
  }

  /** Zijn er wachtenden op dit boek? Dan kan het niet verlengd worden. */
  async hasWaitingReservation(bookId: number, tx: Prisma.TransactionClient): Promise<boolean> {
    return this.reservations.hasWaiting(bookId, tx);
  }

  async fine(id: number): Promise<FineDto> {
    const f = await this.prisma.fine.findUnique({ where: { id }, include: fineInclude });
    if (!f) throw new NotFoundException('Boete niet gevonden');
    return toFineDto(f);
  }
}
